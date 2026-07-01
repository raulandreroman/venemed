"use client";

import { useCallback, useRef, useState } from "react";

import { Button, SegmentedControl } from "@/components/ui";
import { publishAviso, updateAviso } from "@/app/(center)/actions/aviso";
import {
  AVISO_REASON_MAX,
  AVISO_WINDOW_OPTIONS,
  SIN_LIMITE,
  type PublishAvisoInput,
  type WindowChoice,
} from "@/lib/aviso/validation";

import { InsumoSelector } from "../../solicitudes/nueva/_components/insumo-selector";
import type { SelectedItem } from "../../solicitudes/nueva/_components/create-request-form";

type Supply = { id: string; name: string };

/** A successful publish/update still throws NEXT_REDIRECT; re-throw so Next
 * navigates instead of showing a false error (mirrors create-request-form). */
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

const WINDOW_LABEL: Record<string, string> = {
  "12": "12 h",
  "24": "24 h",
  "48": "48 h",
  [SIN_LIMITE]: "Sin límite",
};

/**
 * Aviso de exceso form (Figma 80:2048) — "lo que no estamos aceptando". Reuses
 * the create-solicitud idiom (insumo selector sheet, segmented window, sticky
 * footer, idempotencyKey, redirect re-throw) MINUS the delivery-instructions
 * section. The window adds a 4th "Sin límite" option (string sentinel; the
 * action maps it to a null window). Drives the real publishAviso / updateAviso
 * action (gotcha #2). `avisoId` present ⇒ edit mode.
 */
export function AvisoForm({
  supplies,
  avisoId,
  initialItems = [],
  initialReason = "",
  initialWindowChoice = 24,
}: {
  supplies: Supply[];
  avisoId?: string;
  initialItems?: SelectedItem[];
  initialReason?: string;
  initialWindowChoice?: WindowChoice;
}) {
  const [reason, setReason] = useState(initialReason);
  const [items, setItems] = useState<SelectedItem[]>(initialItems);
  const [windowChoice, setWindowChoice] =
    useState<WindowChoice>(initialWindowChoice);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  }, []);

  const openSelector = useCallback(() => {
    setError(null);
    setSelectorOpen(true);
  }, []);

  const canSubmit =
    items.length > 0 && reason.trim().length <= AVISO_REASON_MAX;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) {
      setError("Agrega al menos un insumo que no estás aceptando.");
      return;
    }
    setError(null);
    setPending(true);
    const input: PublishAvisoInput = {
      reason: reason.trim() || undefined,
      windowChoice,
      items: items.map((it) =>
        it.supplyId ? { supplyId: it.supplyId } : { customName: it.name },
      ),
      idempotencyKey: idempotencyKey.current,
    };
    try {
      if (avisoId) await updateAviso(avisoId, input);
      else await publishAviso(input); // both end in redirect()
    } catch (e) {
      if (isNextRedirectError(e)) throw e; // let Next navigate
      setError("No pudimos guardar el aviso. Inténtalo de nuevo.");
      setPending(false);
    }
  }, [canSubmit, avisoId, reason, windowChoice, items]);

  return (
    <>
      <main className="flex flex-1 flex-col gap-7 px-4 pb-28 pt-4">
        <p className="text-sm text-neutral-500">
          Indica lo que tu centro ya no necesita para que los donantes no envíen
          más de eso.
        </p>

        {/* Lo que no estamos aceptando */}
        <section>
          <h2 className="text-lg font-bold text-neutral-900">
            Lo que no estamos aceptando ({items.length})
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Agrega del catálogo o crea uno nuevo.
          </p>
          {items.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {items.map((it) => (
                <span
                  key={it.key}
                  className="inline-flex items-center gap-1 rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent"
                >
                  {it.name}
                  <button
                    type="button"
                    onClick={() => removeItem(it.key)}
                    aria-label={`Quitar ${it.name}`}
                    className="text-accent/70 hover:text-accent"
                  >
                    <CloseIcon />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            fullWidth
            onClick={openSelector}
            className="mt-3 text-accent"
          >
            <PlusIcon />
            Agregar insumos
          </Button>
        </section>

        {/* Ventana de tiempo */}
        <section>
          <h2 className="text-lg font-bold text-neutral-900">Ventana de tiempo</h2>
          <p className="mt-1 mb-3 text-sm text-neutral-500">
            Tiempo que se mostrará el aviso. &quot;Sin límite&quot; permanece hasta
            que lo quites.
          </p>
          <SegmentedControl
            ariaLabel="Ventana de tiempo"
            value={windowChoice}
            onChange={(v) => setWindowChoice(v)}
            options={AVISO_WINDOW_OPTIONS.map((h) => ({
              value: h,
              label: WINDOW_LABEL[String(h)],
            }))}
          />
        </section>

        {/* Razón (opcional) */}
        <section>
          <h2 className="text-lg font-bold text-neutral-900">
            Razón <span className="text-neutral-400">(opcional)</span>
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Por qué no estás aceptando estos insumos.
          </p>
          <input
            type="text"
            value={reason}
            maxLength={AVISO_REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ej: Ya tenemos suficiente ropa"
            aria-label="Razón del aviso"
            className="mt-3 h-12 w-full rounded-xl border border-neutral-300 bg-surface px-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-300 focus:border-accent focus:ring-2 focus:ring-accent/30"
          />
          <p className="mt-1.5 text-right text-xs text-neutral-400">
            {reason.length} / {AVISO_REASON_MAX}
          </p>
        </section>

        {error && (
          <p role="alert" className="text-sm text-error">
            {error}
          </p>
        )}
      </main>

      {/* sticky publish footer */}
      <footer className="sticky bottom-0 z-20 border-t border-neutral-100 bg-background px-4 py-3">
        <Button type="button" fullWidth disabled={pending} onClick={handleSubmit}>
          {pending
            ? "Guardando…"
            : avisoId
              ? "Guardar cambios"
              : "Publicar aviso"}
        </Button>
      </footer>

      <InsumoSelector
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        supplies={supplies}
        selected={items}
        onConfirm={setItems}
      />
    </>
  );
}

function PlusIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
