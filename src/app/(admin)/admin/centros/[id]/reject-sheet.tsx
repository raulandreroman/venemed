"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui";

import { rejectCenter } from "../../../actions/moderation";

const MOTIVOS = [
  "Datos incompletos",
  "Teléfono no responde",
  "Información no verificable",
  "Centro duplicado",
] as const;

const NOTE_MAX = 280;

/**
 * A4 · Reject-reason sheet (Figma `53:1273`). Bottom-sheet overlay (mirrors the
 * donor request-sheet chrome: scrim + Esc/backdrop close + focus trap). A motivo
 * chip is REQUIRED (primary disabled until one is chosen); the note is optional.
 * Composes `reason = motivo + " — " + note` and calls the rejectCenter action.
 */
export function RejectSheet({
  centerId,
  centerName,
  city,
  onClose,
}: {
  centerId: string;
  centerName: string;
  city: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);

  const [motivo, setMotivo] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Esc to close + body scroll lock + focus trap while open.
  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      panel
        ? Array.from(
            panel.querySelectorAll<HTMLElement>(
              'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter((el) => el.offsetParent !== null)
        : [];

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panel) return;
      const focusable = getFocusable();
      const first = focusable[0] ?? panel;
      const last = focusable[focusable.length - 1] ?? panel;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  const onSubmit = useCallback(async () => {
    if (!motivo) return;
    const trimmedNote = note.trim();
    const reason = trimmedNote ? `${motivo} — ${trimmedNote}` : motivo;
    setSubmitting(true);
    setError(null);
    const result = await rejectCenter(centerId, reason);
    if (result.ok) {
      router.push("/admin?tab=pendientes&done=rejected");
      router.refresh(); // bust the client router cache so the queue reflects the change
      return;
    }
    setSubmitting(false);
    setError(result.error);
  }, [motivo, note, centerId, router]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rechazar centro"
      className="fixed inset-0 z-50"
    >
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-neutral-900/40"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        className="absolute inset-x-0 bottom-0 z-50 mx-auto flex max-h-[92dvh] w-full max-w-[390px] flex-col rounded-t-[24px] bg-surface shadow-xl outline-none"
      >
        <div className="flex shrink-0 justify-center pt-2 pb-1">
          <span className="h-1 w-9 rounded-full bg-neutral-300" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4">
          <h2 className="text-2xl font-bold text-neutral-900">
            Rechazar centro
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            {centerName} · {city}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-neutral-700">
            Selecciona el motivo principal. La nota que escribas llegará al
            responsable por WhatsApp.
          </p>

          <p className="mt-5 text-sm font-semibold text-neutral-900">
            Motivos comunes
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MOTIVOS.map((m) => {
              const selected = motivo === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setMotivo(m)}
                  className={`inline-flex items-center rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                    selected
                      ? "bg-accent text-accent-on"
                      : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>

          <div className="mt-5 flex items-baseline justify-between">
            <label
              htmlFor="reject-note"
              className="text-sm font-semibold text-neutral-900"
            >
              Nota para el centro
            </label>
            <span className="text-sm text-neutral-400">opcional</span>
          </div>
          <textarea
            id="reject-note"
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            placeholder="Explica qué debe corregir el responsable…"
            className="mt-2 w-full resize-none rounded-xl border border-neutral-300 bg-surface p-3 text-[15px] leading-relaxed text-neutral-900 outline-none placeholder:text-neutral-300 focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <p className="mt-1 text-right text-xs text-neutral-400">
            {note.length} / {NOTE_MAX}
          </p>

          {error && (
            <p role="alert" className="mt-2 text-sm text-error">
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-3 border-t border-neutral-100 bg-surface px-5 pb-5 pt-3">
          <Button
            type="button"
            variant="ghost"
            fullWidth
            disabled={submitting}
            onClick={onClose}
            className="border-[1.5px] border-neutral-300 bg-surface text-neutral-900 hover:bg-neutral-50"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            fullWidth
            disabled={!motivo || submitting}
            onClick={onSubmit}
          >
            {submitting ? "Rechazando…" : "Rechazar y notificar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
