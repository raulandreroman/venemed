"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { rejectCenter } from "../../../actions/moderation";
import { ReasonSheet } from "./reason-sheet";

const MOTIVOS = [
  "Datos incompletos",
  "Teléfono no responde",
  "Información no verificable",
  "Centro duplicado",
] as const;

const NOTE_MAX = 280;

/**
 * A4 · Reject-reason sheet (Figma `53:1273`). Bottom-sheet overlay whose chrome
 * (scrim + Esc/backdrop close + focus trap + footer) comes from the shared
 * `ReasonSheet`. A motivo chip is REQUIRED (primary disabled until one is
 * chosen); the note is optional. Composes `reason = motivo + " — " + note` and
 * calls the rejectCenter action.
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

  const [motivo, setMotivo] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <ReasonSheet
      ariaLabel="Rechazar centro"
      title="Rechazar centro"
      subtitle={`${centerName} · ${city}`}
      error={error}
      submitLabel="Rechazar y notificar"
      submittingLabel="Rechazando…"
      submitDisabled={!motivo}
      submitting={submitting}
      onSubmit={onSubmit}
      onClose={onClose}
    >
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
    </ReasonSheet>
  );
}
