"use client";

import { useCallback, useState } from "react";

import { reactivateLista } from "@/app/(center)/actions/gestionar";
import { Button, ConfirmDialog } from "@/components/ui";

/** A successful reactivate still throws NEXT_REDIRECT; re-throw so Next
 * navigates instead of showing a false error (mirrors finalize-button). */
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** "Reactivar lista" on a paused/closed card → the real `reactivateLista`
 * action (gotcha #2), which brings the lista back live and redirects to /centro.
 * When `receptionPaused`, reactivating also resumes the center's reception, so
 * we confirm first (ConfirmDialog) before calling. */
export function ReactivateButton({
  requestId,
  receptionPaused = false,
}: {
  requestId: string;
  receptionPaused?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await reactivateLista(requestId); // ends in redirect()
    } catch (e) {
      if (isNextRedirectError(e)) {
        setPending(false);
        throw e; // let Next navigate
      }
      setError("No pudimos reactivar la lista. Inténtalo de nuevo.");
      setPending(false);
    }
  }, [requestId]);

  // With reception paused, reactivating also turns donations back on → confirm.
  const onClick = useCallback(() => {
    if (receptionPaused) {
      setOpen(true);
    } else {
      void run();
    }
  }, [receptionPaused, run]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        fullWidth
        disabled={pending}
        onClick={onClick}
      >
        {pending ? "Reactivando…" : "Reactivar lista"}
      </Button>
      {error && !receptionPaused && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}

      {receptionPaused && (
        <ConfirmDialog
          open={open}
          title="¿Reactivar esta lista?"
          body="Volverá a ser visible para donantes y se reanudará la recepción de donaciones de tu centro."
          confirmLabel={pending ? "Reactivando…" : "Reactivar"}
          cancelLabel="Cancelar"
          pending={pending}
          error={error}
          onConfirm={run}
          onCancel={() => setOpen(false)}
        />
      )}
    </>
  );
}
