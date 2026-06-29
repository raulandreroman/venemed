"use client";

import { useCallback, useState } from "react";

import { setReception } from "@/app/(center)/actions/recepcion";
import { ConfirmDialog } from "@/components/ui";

/** A successful setReception still throws NEXT_REDIRECT; re-throw so Next
 * navigates instead of showing a false error (mirrors finalizar-button). */
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * "Recepción de donaciones" kill-switch card (Figma 57:1886 Activo / 57:2009
 * Pausado). The switch never calls the action directly when turning OFF — it
 * opens the "Desactivar recepción" confirm (Figma 60:2102, reused ConfirmDialog)
 * → the real `setReception(true)` (gotcha #2). Turning ON (resume) calls
 * `setReception(false)` directly (no confirm). State only mutates from click
 * handlers, never synchronously in an effect body (gotcha #3).
 */
export function ReceptionToggle({
  paused,
  pausedSince,
}: {
  paused: boolean;
  /** e.g. "desde hace 12 min" — precomputed server-side (relative time). */
  pausedSince: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (next: boolean) => {
    setPending(true);
    setError(null);
    try {
      await setReception(next); // ends in redirect()
    } catch (e) {
      if (isNextRedirectError(e)) throw e; // let Next navigate
      setError("No pudimos actualizar la recepción. Inténtalo de nuevo.");
      setPending(false);
    }
  }, []);

  const onSwitch = useCallback(() => {
    if (pending) return;
    if (paused) {
      void run(false); // resume directly — no confirm
    } else {
      setConfirmOpen(true); // pausing needs confirmation
    }
  }, [paused, pending, run]);

  const onConfirm = useCallback(() => {
    void run(true);
  }, [run]);

  return (
    <>
      <div
        className={`rounded-2xl border p-4 ${
          paused
            ? "border-warning/20 bg-warning-tint"
            : "border-success/20 bg-success-tint"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <h2 className="text-base font-bold text-neutral-900">
              Recepción de donaciones
            </h2>
            <p
              className={`mt-1 inline-flex items-center gap-1.5 text-sm font-semibold ${
                paused ? "text-warning" : "text-success"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  paused ? "bg-warning" : "bg-success"
                }`}
              />
              {paused ? `Pausada · ${pausedSince}` : "Activa"}
            </p>
          </div>

          <Switch
            checked={!paused}
            disabled={pending}
            onClick={onSwitch}
            label="Recepción de donaciones"
          />
        </div>

        <p className="mt-3 text-sm text-neutral-700">
          {paused
            ? "Tu centro no aparece en la lista pública. Las solicitudes activas se cerraron al desactivar la recepción."
            : "Tu centro aparece en la lista pública. Los donantes pueden ver tus solicitudes activas y enviar ayuda."}
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-error">
            {error}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="¿Desactivar la recepción?"
        body="Tu centro dejará de aparecer en la lista pública y tus solicitudes activas se cerrarán de inmediato. Esta acción no se puede deshacer."
        confirmLabel={pending ? "Desactivando…" : "Desactivar"}
        cancelLabel="Cancelar"
        pending={pending}
        error={error}
        onConfirm={onConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

/**
 * Minimal accessible switch (no such primitive in ui/index.ts). role="switch" +
 * aria-checked so the e2e can drive it by accessible name. Accent track ON,
 * neutral-300 OFF.
 */
function Switch({
  checked,
  disabled,
  onClick,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
        checked ? "bg-accent" : "bg-neutral-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-surface shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
