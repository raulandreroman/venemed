"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { extendWindow } from "@/app/(center)/actions/gestionar";
import { Button, SegmentedControl } from "@/components/ui";
import { formatDeliveryCutoff } from "@/lib/format";
import { WINDOW_OPTIONS, type WindowHours } from "@/lib/solicitudes/validation";

/** A successful extend still throws NEXT_REDIRECT; re-throw so Next navigates. */
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * "+ Extender ventana" trigger (inside the countdown card) → a bottom-sheet that
 * re-opens the 12/24/48 picker (decision §5.5, reuses SegmentedControl) → the
 * real `extendWindow` action (gotcha #2). State toggles on click events only and
 * the open effect only attaches listeners — never a synchronous setState in the
 * body (gotcha #3).
 */
export function ExtenderButton({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<WindowHours>(24);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Captured on open (event handler, not render) so the close-time preview is a
  // stable value — react-hooks/purity forbids calling Date.now() during render.
  const [openedAt, setOpenedAt] = useState<number>(0);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const submit = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await extendWindow(requestId, hours); // ends in redirect()
    } catch (e) {
      if (isNextRedirectError(e)) {
        // The action redirects to THIS same route, so Next does a soft
        // navigation that refreshes the server data but PRESERVES this client
        // component (it never unmounts). Close the sheet ourselves, otherwise
        // its overlay lingers over the page (e.g. blocking the sticky
        // Finalizar CTA). Re-throw so Next still performs the navigation.
        setOpen(false);
        setPending(false);
        throw e;
      }
      setError("No pudimos extender la ventana. Inténtalo de nuevo.");
      setPending(false);
    }
  }, [requestId, hours]);

  // Preview from the timestamp captured on open (client-only) — no SSR mismatch.
  const newCutoff =
    open && openedAt
      ? formatDeliveryCutoff(new Date(openedAt + hours * 3600 * 1000))
      : "";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpenedAt(Date.now());
          setOpen(true);
        }}
        className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-accent/30 bg-surface text-sm font-semibold text-accent transition-colors hover:bg-accent/5"
      >
        <PlusIcon />
        Extender ventana
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Extender ventana"
          className="fixed inset-0 z-50"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setOpen(false)}
            className="absolute inset-0 h-full w-full cursor-default bg-neutral-900/40"
          />
          <div
            ref={panelRef}
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 z-10 mx-auto flex w-full max-w-[390px] flex-col gap-4 rounded-t-[20px] bg-surface px-4 pb-5 pt-2 shadow-xl outline-none"
          >
            <div className="flex justify-center pb-1">
              <span className="h-1 w-9 rounded-full bg-neutral-300" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-neutral-900">
                Extender ventana
              </h2>
              <p className="mt-1 text-sm text-neutral-500">
                Reinicia el tiempo para recibir donaciones desde ahora.
              </p>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-neutral-900">
                ¿Cuánto extender?
              </p>
              <SegmentedControl
                ariaLabel="Extender ventana"
                value={hours}
                onChange={(v) => setHours(v)}
                options={WINDOW_OPTIONS.map((h) => ({
                  value: h,
                  label: `+${h} h`,
                }))}
              />
            </div>

            <p className="rounded-xl bg-accent-subtle px-4 py-3 text-sm text-accent">
              Se cerrará {newCutoff.toLowerCase()}.
            </p>

            {error && (
              <p role="alert" className="text-sm text-error">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-2">
              <Button
                type="button"
                fullWidth
                disabled={pending}
                onClick={submit}
              >
                {pending ? "Extendiendo…" : "Extender"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                fullWidth
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PlusIcon() {
  return (
    <svg
      width="16"
      height="16"
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
