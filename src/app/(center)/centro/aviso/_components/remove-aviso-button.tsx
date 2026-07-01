"use client";

import { useCallback, useState } from "react";

import { removeAviso } from "@/app/(center)/actions/aviso";
import { Button, ConfirmDialog } from "@/components/ui";

/** A successful remove still throws NEXT_REDIRECT; re-throw so Next navigates. */
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * "Quitar aviso" CTA → centered confirm dialog → the real `removeAviso` action
 * (gotcha #2). Removing is the only way a "Sin límite" aviso clears. State
 * toggles on click events only (gotcha #3).
 */
export function RemoveAvisoButton({ avisoId }: { avisoId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      await removeAviso(avisoId); // ends in redirect()
    } catch (e) {
      if (isNextRedirectError(e)) throw e;
      setError("No pudimos quitar el aviso. Inténtalo de nuevo.");
      setPending(false);
    }
  }, [avisoId]);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        fullWidth
        onClick={() => setOpen(true)}
      >
        Quitar aviso
      </Button>

      <ConfirmDialog
        open={open}
        title="¿Quitar este aviso?"
        body="Dejará de mostrarse a los donantes. Podrás crear uno nuevo cuando lo necesites."
        confirmLabel={pending ? "Quitando…" : "Quitar"}
        cancelLabel="Cancelar"
        pending={pending}
        error={error}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
