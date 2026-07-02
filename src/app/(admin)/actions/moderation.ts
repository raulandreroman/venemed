"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import { db } from "@/db";
import { center, moderationEvent } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/require-admin";
import { sendCenterApprovedEmail } from "@/lib/email/send-center-approved";
import type { ModerationResult } from "./types";

// --- helpers (module-private; not exported, so this file stays "use server"-safe) ---

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REASON_MAX = 400;

const GENERIC_ERROR =
  "No se pudo guardar la decisión. Inténtalo de nuevo.";
const VALIDATION_ERROR = "Datos inválidos.";

const ADMIN_LIST_TAGS = [
  "admin-centers",
  "admin-centers:pending_review",
  "admin-centers:approved",
  "admin-centers:rejected",
  "admin-centers:suspended",
];

function revalidateAdminLists(opts?: { landing?: boolean }) {
  for (const tag of ADMIN_LIST_TAGS) revalidateTag(tag, "max");
  if (opts?.landing) revalidateTag("landing-stats", "max");
}

// ---- 4.1 approveCenter -----------------------------------------------------

/**
 * Approve a center. Authorizes via requireAdmin() FIRST (the actor id is taken
 * from the verified session, never from client input), re-fetches the center
 * server-side, then atomically flips status→approved and writes the audit row.
 */
export async function approveCenter(
  centerId: string,
): Promise<ModerationResult> {
  const admin = await requireAdmin();

  if (typeof centerId !== "string" || !UUID_RE.test(centerId)) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  try {
    const ok = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(center)
        .set({
          status: "approved",
          verifiedAt: sql`now()`,
          rejectionReason: null,
          updatedAt: sql`now()`,
        })
        // re-review path: approve from pending OR a prior rejection/suspension.
        .where(
          and(
            eq(center.id, centerId),
            inArray(center.status, [
              "pending_review",
              "rejected",
              "suspended",
            ]),
          ),
        )
        .returning({ id: center.id });

      if (!updated) return false;

      await tx.insert(moderationEvent).values({
        actorUserId: admin.userId,
        subjectType: "center",
        subjectId: centerId,
        action: "approved",
        reason: null,
      });
      return true;
    });

    if (!ok) return { ok: false, error: GENERIC_ERROR };

    // Approve changes the donor landing's approved-center count + center routing.
    revalidateAdminLists({ landing: true });

    // Best-effort: notify the center they can now publish. Only reached on a
    // real transition (the status guard early-returns on re-approve above).
    // sendCenterApprovedEmail swallows its own errors and never throws, so a
    // send failure can't turn this committed approval into a reported failure.
    await sendCenterApprovedEmail(centerId);

    return { ok: true, status: "approved" };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ---- 4.2 rejectCenter ------------------------------------------------------

/**
 * Reject a center with a required, non-empty reason (the UI composes
 * motivo + optional note). Re-validates the reason server-side (defense in
 * depth) and writes status→rejected + audit atomically.
 */
export async function rejectCenter(
  centerId: string,
  reason: string,
): Promise<ModerationResult> {
  const admin = await requireAdmin();

  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (
    typeof centerId !== "string" ||
    !UUID_RE.test(centerId) ||
    trimmed.length === 0 ||
    trimmed.length > REASON_MAX
  ) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  try {
    const ok = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(center)
        .set({
          status: "rejected",
          rejectionReason: trimmed,
          verifiedAt: null,
          updatedAt: sql`now()`,
        })
        .where(eq(center.id, centerId))
        .returning({ id: center.id });

      if (!updated) return false;

      await tx.insert(moderationEvent).values({
        actorUserId: admin.userId,
        subjectType: "center",
        subjectId: centerId,
        action: "rejected",
        reason: trimmed,
      });
      return true;
    });

    if (!ok) return { ok: false, error: GENERIC_ERROR };

    // Reject doesn't change the approved count → skip landing-stats.
    revalidateAdminLists();
    return { ok: true, status: "rejected" };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}

// ---- 4.3 suspendCenter (server-side only; no screen this slice) ------------

/**
 * Suspend an (approved) center. Mirrors reject; rejection_reason is reused as
 * the "needs attention" message (suspended → /centro/rechazado in
 * ROUTE_BY_STATUS). Wired to UI in the A5 fast-follow.
 */
export async function suspendCenter(
  centerId: string,
  reason: string,
): Promise<ModerationResult> {
  const admin = await requireAdmin();

  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (
    typeof centerId !== "string" ||
    !UUID_RE.test(centerId) ||
    trimmed.length === 0 ||
    trimmed.length > REASON_MAX
  ) {
    return { ok: false, error: VALIDATION_ERROR };
  }

  try {
    const ok = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(center)
        .set({
          status: "suspended",
          rejectionReason: trimmed,
          verifiedAt: null,
          updatedAt: sql`now()`,
        })
        .where(eq(center.id, centerId))
        .returning({ id: center.id });

      if (!updated) return false;

      await tx.insert(moderationEvent).values({
        actorUserId: admin.userId,
        subjectType: "center",
        subjectId: centerId,
        action: "suspended",
        reason: trimmed,
      });
      return true;
    });

    if (!ok) return { ok: false, error: GENERIC_ERROR };

    // A suspended center drops out of the approved count.
    revalidateAdminLists({ landing: true });
    return { ok: true, status: "suspended" };
  } catch {
    return { ok: false, error: GENERIC_ERROR };
  }
}
