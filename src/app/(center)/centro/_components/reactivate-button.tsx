"use client";

import { useCallback, useState } from "react";

import { reactivateLista } from "@/app/(center)/actions/gestionar";
import { Button } from "@/components/ui";

/** A successful reactivate still throws NEXT_REDIRECT; re-throw so Next
 * navigates instead of showing a false error (mirrors finalize-button). */
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** "Reactivar solicitud" on an inactive (closed/expired) dashboard card → the
 * real `reactivateRequest` action (gotcha #2), which reopens it with a fresh
 * window and redirects back to /centro. */
export function ReactivateButton({ requestId }: { requestId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onClick = useCallback(async () => {
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
      {error && (
        <p role="alert" className="mt-2 text-sm text-error">
          {error}
        </p>
      )}
    </>
  );
}
