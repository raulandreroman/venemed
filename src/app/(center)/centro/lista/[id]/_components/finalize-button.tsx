"use client";

import { useCallback, useState } from "react";

import { finalizeLista } from "@/app/(center)/actions/gestionar";
import { Button, ConfirmDialog } from "@/components/ui";

/** A successful finalize still throws NEXT_REDIRECT; re-throw so Next navigates
 * instead of showing a false error (mirrors create-request-form). */
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Sticky "Finalizar solicitud" CTA → centered confirm dialog (Figma 77:1525) →
 * the real `finalizeRequest` action (gotcha #2: drives the actual submit). State
 * toggles on click events only (gotcha #3).
 */
export function FinalizeButton({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await finalizeLista(requestId); // ends in redirect()
    } catch (e) {
      if (isNextRedirectError(e)) throw e; // let Next navigate
      setError("No pudimos finalizar la solicitud. Inténtalo de nuevo.");
      setPending(false);
    }
  }, [requestId]);

  return (
    <>
      <Button type="button" fullWidth onClick={() => setOpen(true)}>
        Finalizar solicitud
      </Button>

      <ConfirmDialog
        open={open}
        title="¿Finalizar esta solicitud?"
        body="Dejará de ser visible para donantes y se marcará como cumplida. Esta acción no se puede deshacer."
        confirmLabel={pending ? "Finalizando…" : "Finalizar"}
        cancelLabel="Cancelar"
        pending={pending}
        error={error}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
