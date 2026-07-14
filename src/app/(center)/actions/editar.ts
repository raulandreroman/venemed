"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { appUser, center } from "@/db/schema";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import { requireResponsable } from "@/lib/auth/require-responsable";
import {
  validateCenterDetails,
  validateResponsable,
  validateRegistro,
} from "@/lib/registro/validation";
import type {
  CenterDetailsInput,
  CreateCenterInput,
  ResponsableInput,
} from "@/lib/registro/validation";

// NOTE: a "use server" module may export ONLY async functions. Do not re-export
// types here — input types are imported via `import type` above.

/**
 * Update ONLY the session center's "Datos del centro" (name/type/state/city/
 * address/reference) — the profile's inline "Editar datos del centro"
 * section. Phone/responsable/status untouched. center_id is server-resolved
 * (Drizzle bypasses RLS); re-validates server-side. Returns (no redirect) so the
 * inline editor can exit edit mode + router.refresh(); throws on invalid input
 * (the client pre-validates, so this is defense-in-depth).
 */
export async function updateCenterDetails(
  input: CenterDetailsInput,
): Promise<void> {
  const { centerId } = await requireResponsable();

  if (Object.keys(validateCenterDetails(input)).length > 0) {
    throw new Error("Datos del centro inválidos.");
  }

  await db
    .update(center)
    .set({
      name: input.name.trim(),
      type: input.type,
      city: input.city.trim(),
      state: input.state,
      addressLine: input.addressLine.trim(),
      addressReference: input.addressReference?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(center.id, centerId));

  revalidatePath("/centro/perfil");
}

/**
 * Update ONLY the session center's responsable (name + cargo), the center's
 * optional WhatsApp contact phone, and the preferred delivery schedule — the
 * profile's inline "Cambiar responsable" section. The email is NOT editable
 * here (it's the verified login identity). The phone + schedule live on
 * `center`, so this writes two rows. Same authz/validation/return contract.
 */
export async function updateResponsable(input: ResponsableInput): Promise<void> {
  const { userId, centerId } = await requireResponsable();

  if (Object.keys(validateResponsable(input)).length > 0) {
    throw new Error("Datos del responsable inválidos.");
  }

  await db
    .update(appUser)
    .set({
      name: input.responsibleName.trim(),
      cargo: input.cargo?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(appUser.id, userId));

  await db
    .update(center)
    .set({
      whatsappPhone: input.whatsappPhone?.trim() || null,
      regularScheduleText: input.regularScheduleText?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(center.id, centerId));

  revalidatePath("/centro/perfil");
}

/**
 * Server-trust update of ONLY the session's center + its responsible person.
 * Authorization is derived from `getCurrentCenter()` (membership → centerId);
 * a client-supplied id is never trusted (Drizzle bypasses RLS). Re-validates
 * the payload, keeps `status`/`verified_at`/`rejection_reason` untouched. The
 * WhatsApp number is now an editable, optional contact field.
 *
 * Ends in `redirect(...)`; does not return on the happy path.
 */
export async function updateCenterForCurrentUser(
  input: CreateCenterInput,
): Promise<void> {
  // (1) Resolve session/authz — Responsable-only (requireResponsable bounces
  // an Operador to /centro; anon/no-membership route the same as before).
  const { centerId, userId, status } = await requireResponsable();

  // (2) Re-validate server-side (defense-in-depth against tampering).
  const errors = validateRegistro(input);
  if (Object.keys(errors).length > 0) {
    throw new Error("Datos del centro inválidos.");
  }

  const whatsappPhone = input.whatsappPhone?.trim() || null;
  const now = new Date();

  // (3) Transaction: update center + app_user, both keyed by server-resolved
  // ids. status / verified_at / rejection_reason / created_at are never touched.
  await db.transaction(async (tx) => {
    await tx
      .update(center)
      .set({
        name: input.name.trim(),
        type: input.type,
        city: input.city.trim(),
        state: input.state,
        addressLine: input.addressLine.trim(),
        addressReference: input.addressReference?.trim() || null,
        regularScheduleText: input.regularScheduleText?.trim() || null,
        whatsappPhone,
        updatedAt: now,
      })
      .where(eq(center.id, centerId));

    await tx
      .update(appUser)
      .set({
        name: input.responsibleName.trim(),
        cargo: input.cargo?.trim() || null,
        updatedAt: now,
      })
      .where(eq(appUser.id, userId));
  });

  // (4) Redirect AFTER commit to the status-appropriate landing (redirect throws).
  redirect(ROUTE_BY_STATUS[status] ?? "/centro/en-revision");
}
