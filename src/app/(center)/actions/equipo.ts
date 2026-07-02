"use server";

import { and, count, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { appUser, center, invitation, membership } from "@/db/schema";
import { requireResponsable } from "@/lib/auth/require-responsable";
import { ROUTE_BY_STATUS, upsertAppUserFromSession } from "@/lib/auth/on-login";
import { createClient } from "@/lib/supabase/server";
import { getInvitationForJoin, countCenterMembers } from "@/db/queries";
import { generateInviteToken, hashInviteToken } from "@/lib/team/token";
import { getBaseUrl } from "@/lib/team/url";
import { isCenterFull, MEMBER_CAP, validateInviteLabel } from "@/lib/team/validation";

// NOTE: a "use server" module may export ONLY async functions (gotcha #1). Do
// not re-export types/consts here — MEMBER_CAP/validateInviteLabel etc. are
// values imported for internal use only.

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h

/**
 * Responsable creates a single-use invite link. Enforces the 5-member cap as a
 * pre-check (the authoritative, race-safe check is inside `acceptInvitation`,
 * which locks the center row — see there for why this pre-check alone is not
 * sufficient to prevent a rare create-time TOCTOU: two Responsables could both
 * pass this check before either commits, which is fine — invitations are cheap
 * and the cap is enforced again, safely, at accept time).
 */
export async function createInvitation(label?: string): Promise<{ url: string }> {
  const current = await requireResponsable();
  if (current.status !== "approved") {
    redirect(ROUTE_BY_STATUS[current.status] ?? "/centro/en-revision");
  }
  const { centerId, userId } = current;

  const parsed = validateInviteLabel(label);
  if (!parsed.ok) throw new Error(parsed.error);

  const memberCount = await countCenterMembers(centerId);
  if (isCenterFull(memberCount)) {
    throw new Error(`Tu equipo ya tiene el máximo de ${MEMBER_CAP} miembros.`);
  }

  const { raw, hash } = generateInviteToken();

  await db.insert(invitation).values({
    centerId,
    tokenHash: hash,
    role: "center_member",
    label: parsed.value,
    invitedBy: userId,
    status: "pending",
    expiresAt: new Date(Date.now() + INVITE_TTL_MS),
  });

  const base = await getBaseUrl();

  revalidatePath("/centro/equipo");
  // SECURITY: `raw` is returned to the caller (rendered once in the "Enlace
  // creado" sheet) and NEVER logged / persisted beyond this return value.
  return { url: `${base}/centro/unirse/${raw}` };
}

/** Responsable revokes a still-pending invite. Center-scoped; ignores
 * non-owned/non-pending ids (no error surfaced — the row simply won't match). */
export async function revokeInvitation(invitationId: string): Promise<void> {
  const current = await requireResponsable();

  await db
    .update(invitation)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(
      and(
        eq(invitation.id, invitationId),
        eq(invitation.centerId, current.centerId),
        eq(invitation.status, "pending"),
      ),
    );

  revalidatePath("/centro/equipo");
}

type JoinOutcome = "ok" | "invalida" | "lleno" | "ya-tienes";

/**
 * Bind the currently-authed (email-verified) user to the center behind
 * `rawToken`. Always ends in `redirect(...)`.
 *
 * SECURITY: looks the invitation up by the SHA-256 hash of the raw token
 * (never the raw value) and funnels every failure mode — unknown hash,
 * non-pending status, expired, unapproved center — to the SAME generic
 * `/centro/unirse/invalida` destination, so a caller can never distinguish
 * "wrong token" from "already used" from "expired".
 *
 * The member-cap check is the AUTHORITATIVE one (createInvitation's is only a
 * pre-check): it runs inside a transaction that takes a `SELECT … FOR UPDATE`
 * lock on the center row first, serializing concurrent accepts against the
 * same center so two different invitees can never both slip past `count < 5`.
 */
export async function acceptInvitation(rawToken: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/centro/login");

  // A brand-new invitee has no app_user row yet — this login never went
  // through finishLogin/resolveLoginDestination.
  await upsertAppUserFromSession(user);

  const hash = hashInviteToken(rawToken);
  const pre = await getInvitationForJoin(hash);
  const now = Date.now();
  if (
    !pre ||
    pre.status !== "pending" ||
    pre.expiresAt.getTime() <= now ||
    pre.centerStatus !== "approved"
  ) {
    redirect("/centro/unirse/invalida");
  }

  // One-center-per-user: a fast, non-authoritative pre-check for a clear
  // message. The membership_user_id_key unique index is the real backstop
  // (caught below as a unique-violation on the insert).
  const already = await db
    .select({ id: membership.id })
    .from(membership)
    .where(eq(membership.userId, user.id))
    .limit(1);
  if (already.length > 0) {
    redirect("/centro/unirse/ya-tienes");
  }

  // The transaction RETURNS its outcome (rather than mutating an outer `let`
  // from inside the callback) so the type of `outcome` below is tracked
  // straightforwardly — TS's control-flow analysis does not narrow a captured
  // variable based on assignments made inside a nested closure.
  type TxOutcome = "ok" | "invalida" | "lleno";
  let outcome: JoinOutcome;
  try {
    outcome = await db.transaction(async (tx): Promise<TxOutcome> => {
      // Lock the center row FIRST so member-count reads below are serialized
      // against any other concurrent accept for this same center.
      const [lockedCenter] = await tx
        .select({ id: center.id, status: center.status })
        .from(center)
        .where(eq(center.id, pre.centerId))
        .for("update");
      if (!lockedCenter || lockedCenter.status !== "approved") {
        return "invalida";
      }

      const [lockedInvitation] = await tx
        .select({ status: invitation.status, expiresAt: invitation.expiresAt })
        .from(invitation)
        .where(eq(invitation.id, pre.invitationId))
        .for("update");
      if (
        !lockedInvitation ||
        lockedInvitation.status !== "pending" ||
        lockedInvitation.expiresAt.getTime() <= Date.now()
      ) {
        return "invalida";
      }

      const [{ n: memberCount }] = await tx
        .select({ n: count() })
        .from(membership)
        .where(eq(membership.centerId, pre.centerId));
      if (isCenterFull(memberCount)) {
        return "lleno";
      }

      const now2 = new Date();
      await tx.insert(membership).values({
        userId: user.id,
        centerId: pre.centerId,
        role: "center_member",
      });
      await tx
        .update(invitation)
        .set({
          status: "accepted",
          acceptedBy: user.id,
          acceptedAt: now2,
          updatedAt: now2,
        })
        .where(eq(invitation.id, pre.invitationId));

      // The Responsable's optional "Nombre (opcional)" label becomes the new
      // member's display name until they set their own — only fills a NULL
      // name, never overwrites one that's already there.
      if (pre.label) {
        await tx
          .update(appUser)
          .set({ name: sql`coalesce(${appUser.name}, ${pre.label})` })
          .where(eq(appUser.id, user.id));
      }

      return "ok";
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      outcome = "ya-tienes";
    } else {
      throw err;
    }
  }

  if (outcome === "invalida") redirect("/centro/unirse/invalida");
  if (outcome === "lleno") redirect("/centro/unirse/lleno");
  if (outcome === "ya-tienes") redirect("/centro/unirse/ya-tienes");

  revalidatePath("/centro/equipo");
  redirect("/centro");
}

/**
 * The invitee declines an invite (or opens an already-decided one and wants to
 * bail). Possessing the raw token IS the authority here — no session required.
 * Safe/idempotent: only flips a still-pending row.
 */
export async function rejectInvitation(rawToken: string): Promise<void> {
  const hash = hashInviteToken(rawToken);
  await db
    .update(invitation)
    .set({ status: "revoked", updatedAt: new Date() })
    .where(and(eq(invitation.tokenHash, hash), eq(invitation.status, "pending")));
  redirect("/");
}

/**
 * Responsable removes an Operador. Cannot remove yourself (the Responsable);
 * scoped to `role = 'center_member'` so an admin row can never be deleted via
 * this path. The member's authored listas are untouched (FK is
 * lista.center_id, not the user) — they stay attributed to their name.
 */
export async function removeMember(userId: string): Promise<void> {
  const current = await requireResponsable();
  if (userId === current.userId) {
    throw new Error("No puedes quitarte a ti mismo como responsable.");
  }

  await db
    .delete(membership)
    .where(
      and(
        eq(membership.userId, userId),
        eq(membership.centerId, current.centerId),
        eq(membership.role, "center_member"),
      ),
    );

  revalidatePath("/centro/equipo");
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
