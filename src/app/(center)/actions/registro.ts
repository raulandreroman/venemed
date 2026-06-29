"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { appUser, center, membership } from "@/db/schema";
import { getCurrentCenter } from "@/lib/auth/current-center";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import {
  normalizeVePhone,
  validateRegistro,
  type CreateCenterInput,
} from "@/lib/registro/validation";
import { createClient } from "@/lib/supabase/server";

// NOTE: a "use server" module may export ONLY async functions. Do not re-export
// types here — import CreateCenterInput from "@/lib/registro/validation" instead.

/**
 * Transactional, idempotent registration write. Runs AFTER the phone is
 * verified (anon flow) or for an already-authed no-membership user. Trust starts
 * at `getUser()`: the new center id is generated server-side and the membership
 * binds `session.user.id` — no client-supplied id is ever trusted. The full
 * payload is re-validated here (defense-in-depth) before the transaction.
 *
 * Ends in `redirect(...)`; does not return on the happy path.
 */
export async function createCenterForCurrentUser(
  input: CreateCenterInput,
): Promise<void> {
  // (1) Resolve session — getUser() is JWT-verified; cookies() is awaited inside
  // the Phase 1 server client.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/centro/login"); // defensive; should not happen post-verify

  // (2) Idempotency pre-check — an existing membership is never duplicated.
  const current = await getCurrentCenter();
  if (current.kind === "center") {
    redirect(ROUTE_BY_STATUS[current.center.status] ?? "/centro/en-revision");
  }

  // (3) Re-validate the full payload server-side. A failure here means the
  // client validation was bypassed (tampering) — surface a generic error.
  const errors = validateRegistro(input);
  if (Object.keys(errors).length > 0) {
    throw new Error("Datos de registro inválidos.");
  }

  // (3a) The OTP-verified session phone is the ONLY source of truth for the
  // center's contact number (spec §4.3: "this phone is the OTP target AND
  // center.whatsapp_phone"). A "use server" action is a public POST endpoint, so
  // the client `whatsappPhone` is never trusted to bind the number — it is at
  // most a display hint. Reject any submission whose phone does not match the
  // number proven by OTP, and persist the server-trusted value below.
  // Normalize BOTH sides with the same canonicalizer so equivalent formats
  // (stray trunk-0, +58 prefix, raw digits) compare equal.
  const verifiedPhone = normalizeVePhone(user.phone);
  if (!verifiedPhone) redirect("/centro/login"); // no verified phone on session
  if (normalizeVePhone(input.whatsappPhone) !== verifiedPhone) {
    throw new Error("El teléfono no coincide con el número verificado.");
  }

  const now = new Date();

  // (4) Transaction: upsert app_user, insert center (pending_review), insert
  // membership (center_admin) — all-or-nothing.
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(appUser)
        .values({
          id: user.id,
          phone: verifiedPhone,
          name: input.responsibleName.trim(),
          cargo: input.cargo?.trim() || null,
          phoneVerifiedAt: now,
          lastLoginAt: now,
        })
        .onConflictDoUpdate({
          target: appUser.id,
          set: {
            name: input.responsibleName.trim(),
            cargo: input.cargo?.trim() || null,
            phone: verifiedPhone,
            phoneVerifiedAt: now,
            updatedAt: now,
          },
        });

      const [inserted] = await tx
        .insert(center)
        .values({
          name: input.name.trim(),
          type: input.type,
          city: input.city.trim(),
          state: input.state,
          addressLine: input.addressLine.trim(),
          addressReference: input.addressReference?.trim() || null,
          regularScheduleText: input.regularScheduleText?.trim() || null,
          whatsappPhone: verifiedPhone,
          status: "pending_review",
        })
        .returning({ id: center.id });

      await tx.insert(membership).values({
        userId: user.id,
        centerId: inserted.id,
        role: "center_admin",
      });
    });
  } catch (err) {
    // Unique-violation on membership.user_id: a concurrent request already
    // created this user's center (the TOCTOU race the step-2 pre-check cannot
    // close). Re-resolve and route to the canonical destination instead of
    // creating a duplicate.
    if (isUniqueViolation(err)) {
      const resolved = await getCurrentCenter();
      if (resolved.kind === "center") {
        redirect(
          ROUTE_BY_STATUS[resolved.center.status] ?? "/centro/en-revision",
        );
      }
    }
    throw err;
  }

  // (5) Redirect AFTER the transaction commits (redirect throws).
  redirect("/centro/en-revision");
}

/** Postgres unique_violation (SQLSTATE 23505), as surfaced by postgres-js. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}
