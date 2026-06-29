"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { appUser, center } from "@/db/schema";
import { getCurrentCenter } from "@/lib/auth/current-center";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import { normalizeVePhone, validateRegistro } from "@/lib/registro/validation";
import type { CreateCenterInput } from "@/lib/registro/validation";
import { createClient } from "@/lib/supabase/server";

// NOTE: a "use server" module may export ONLY async functions. Do not re-export
// types here — `CreateCenterInput` is imported via `import type` above.

/**
 * Server-trust update of ONLY the session's center + its responsible person.
 * Authorization is derived from `getCurrentCenter()` (membership → centerId);
 * a client-supplied id is never trusted (Drizzle bypasses RLS). Re-validates
 * the payload, keeps `status`/`verified_at`/`rejection_reason` untouched, and
 * persists the verified session phone (the client phone is never rebindable).
 *
 * Ends in `redirect(...)`; does not return on the happy path.
 */
export async function updateCenterForCurrentUser(
  input: CreateCenterInput,
): Promise<void> {
  // (1) Resolve session/authz. redirect() returns `never`, narrowing `current`
  // to the "center" branch below.
  const current = await getCurrentCenter();
  if (current.kind === "anon") redirect("/centro/login");
  if (current.kind === "no-membership") redirect("/centro/registro");
  const { centerId, userId, status } = current.center;

  // (2) Re-validate server-side (defense-in-depth against tampering).
  const errors = validateRegistro(input);
  if (Object.keys(errors).length > 0) {
    throw new Error("Datos del centro inválidos.");
  }

  // (3) Phone is server-trusted: resolve the verified value from the session and
  // ignore any client-supplied phone for binding.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/centro/login");
  const verifiedPhone = normalizeVePhone(user.phone);
  if (!verifiedPhone) redirect("/centro/login");

  const now = new Date();

  // (4) Transaction: update center + app_user, both keyed by server-resolved
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
        whatsappPhone: verifiedPhone,
        updatedAt: now,
      })
      .where(eq(center.id, centerId));

    await tx
      .update(appUser)
      .set({ name: input.responsibleName.trim(), updatedAt: now })
      .where(eq(appUser.id, userId));
  });

  // (5) Redirect AFTER commit to the status-appropriate landing (redirect throws).
  redirect(ROUTE_BY_STATUS[status] ?? "/centro/en-revision");
}
