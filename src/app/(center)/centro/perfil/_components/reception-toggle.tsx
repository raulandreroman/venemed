"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { setReception } from "@/app/(center)/actions/recepcion";
import { Button } from "@/components/ui";

type ActiveRequest = { id: string; label: string };

/** A successful setReception still throws NEXT_REDIRECT; re-throw so Next
 * navigates instead of showing a false error (mirrors finalize-button). */
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * "Recepción de donaciones" kill-switch card (Figma 57:1886 Activo / 57:2009
 * Pausado). The switch never calls the action directly when turning OFF — it
 * opens the "Desactivar recepción" bottom-sheet (Figma 60:2102) that lists the
 * active requests that will close → the real `setReception(true)` (gotcha #2).
 * Turning ON (resume) calls `setReception(false)` directly (no confirm). State
 * only mutates from click handlers, never synchronously in an effect (gotcha #3).
 */
export function ReceptionToggle({
  paused,
  pausedSince,
  activeRequests,
}: {
  paused: boolean;
  /** e.g. "desde hace 12 min" — precomputed server-side (relative time). */
  pausedSince: string;
  /** active listas that will close on pause. */
  activeRequests: ActiveRequest[];
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape + body-scroll-lock while the sheet is open (mirrors extend-button).
  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [confirmOpen]);

  const count = activeRequests.length;

  const run = useCallback(async (next: boolean) => {
    setPending(true);
    setError(null);
    try {
      await setReception(next); // ends in redirect()
    } catch (e) {
      if (isNextRedirectError(e)) {
        // setReception redirects to THIS same route → Next soft-navigates and
        // PRESERVES this client component (the sheet never unmounts). Close it
        // ourselves so it doesn't linger on "Desactivando…". Re-throw so Next
        // still performs the navigation. (Mirrors extend-button.)
        setConfirmOpen(false);
        setPending(false);
        throw e;
      }
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

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Desactivar la recepción"
          className="fixed inset-0 z-50"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => !pending && setConfirmOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-neutral-900/40"
          />
          <div
            ref={panelRef}
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 z-10 mx-auto flex max-h-[85dvh] w-full max-w-[390px] flex-col gap-4 overflow-y-auto rounded-t-[20px] bg-surface px-5 pb-5 pt-2 text-center shadow-xl outline-none"
          >
            <div className="flex justify-center pb-1">
              <span className="h-1 w-9 rounded-full bg-neutral-300" />
            </div>

            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-warning-tint text-warning">
              <PauseIcon />
            </span>

            <div>
              <h2 className="text-lg font-bold text-neutral-900">
                ¿Desactivar la recepción?
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-neutral-500">
                Tu centro dejará de aparecer en la lista pública. Tus solicitudes
                activas se cerrarán inmediatamente.
              </p>
            </div>

            {count > 0 && (
              <div className="rounded-xl bg-warning-tint p-3.5 text-left">
                <p className="text-sm font-semibold text-warning">
                  {count === 1
                    ? "Se cerrará 1 solicitud activa:"
                    : `Se cerrarán ${count} solicitudes activas:`}
                </p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {activeRequests.map((r) => (
                    <li
                      key={r.id}
                      className="flex gap-2 text-sm text-neutral-700"
                    >
                      <span aria-hidden className="text-warning">
                        •
                      </span>
                      <span>{r.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs leading-relaxed text-neutral-400">
              Podrás reactivar la recepción cuando vuelvas a poder recibir
              donaciones. Si solo quieres cerrar algunas solicitudes, puedes
              finalizarlas una por una sin desactivar la recepción.
            </p>

            {error && (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                fullWidth
                disabled={pending}
                onClick={() => setConfirmOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                fullWidth
                disabled={pending}
                onClick={onConfirm}
              >
                {pending ? "Desactivando…" : "Desactivar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PauseIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
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
