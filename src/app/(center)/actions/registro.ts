"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { appUser, center, membership } from "@/db/schema";
import { getCurrentCenter } from "@/lib/auth/current-center";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import {
  validateRegistro,
  type CreateCenterInput,
} from "@/lib/registro/validation";
import { sendCenterPendingEmail } from "@/lib/email/send-center-pending";
import { createClient } from "@/lib/supabase/server";

// NOTE: a "use server" module may export ONLY async functions. Do not re-export
// types here — import CreateCenterInput from "@/lib/registro/validation" instead.

/**
 * Transactional, idempotent registration write. Runs AFTER the email is
 * verified (anon flow) or for an already-authed no-membership user. Trust starts
 * at `getUser()`: the new center id is generated server-side, the app_user email
 * comes from the verified session (never the client), and the membership binds
 * `session.user.id`. The full payload is re-validated here (defense-in-depth).
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

  // (3a) Identity comes from the verified session email — never the client. The
  // WhatsApp number is a REQUIRED, unverified contact field (#102), already
  // validated non-empty above, so we persist the client value as-is.
  const email = user.email?.trim().toLowerCase() || undefined;
  const whatsappPhone = input.whatsappPhone.trim();
  const now = new Date();

  // (4) Transaction: upsert app_user, insert center (pending_review), insert
  // membership (center_admin) — all-or-nothing.
  let newCenterId: string | undefined;
  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(appUser)
        .values({
          id: user.id,
          email,
          name: input.responsibleName.trim(),
          cargo: input.cargo?.trim() || null,
          emailVerifiedAt: now,
          lastLoginAt: now,
        })
        .onConflictDoUpdate({
          target: appUser.id,
          set: {
            name: input.responsibleName.trim(),
            cargo: input.cargo?.trim() || null,
            email,
            emailVerifiedAt: now,
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
          whatsappPhone,
          status: "pending_review",
        })
        .returning({ id: center.id });

      await tx.insert(membership).values({
        userId: user.id,
        centerId: inserted.id,
        role: "center_admin",
      });

      newCenterId = inserted.id;
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

  // (5) Best-effort: notify moderators a new center is awaiting review. Runs
  // after commit, before redirect; never throws (own try/catch), so a send
  // failure can't fail the registration.
  if (newCenterId) {
    await sendCenterPendingEmail({
      centerId: newCenterId,
      centerName: input.name.trim(),
      location: `${input.city.trim()}, ${input.state}`,
    });
  }

  // (6) Redirect AFTER the transaction commits (redirect throws).
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
