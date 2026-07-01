"use client";

import { useState } from "react";
import type { CreateCenterInput } from "@/lib/registro/validation";
import { updateCenterForCurrentUser } from "../../actions/editar";
import {
  CenterDatosForm,
  type CenterDatosValues,
} from "../_components/center-datos-form";

/**
 * Local, dependency-free redirect detection. NEXT_REDIRECT is the digest Next
 * stamps on the error thrown by redirect(); never import isRedirectError from
 * next/dist/client/components/redirect (unstable internal path).
 */
function isNextRedirectError(e: unknown): boolean {
  const digest = (e as { digest?: unknown })?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/** Thin client wrapper: owns the save-error state and wires the shared form to
 * `updateCenterForCurrentUser`. The page (RSC) loads + pre-fills the data. */
export function EditCenterForm({
  initialValues,
}: {
  initialValues: CenterDatosValues;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <CenterDatosForm
      initialValues={initialValues}
      submitLabel="Guardar cambios"
      submitPendingLabel="Guardando…"
      headerSlot={null}
      footerError={error}
      onSubmit={async (input: CreateCenterInput) => {
        setError(null);
        try {
          await updateCenterForCurrentUser(input); // ALWAYS ends in redirect()
        } catch (e) {
          // A successful save still throws NEXT_REDIRECT. Re-throw it BEFORE
          // setError so Next can navigate; otherwise every successful save shows
          // a false "No pudimos guardar".
          if (isNextRedirectError(e)) throw e;
          setError("No pudimos guardar los cambios. Inténtalo de nuevo.");
          throw e; // re-enable the button via the shared form's finally
        }
      }}
    />
  );
}
