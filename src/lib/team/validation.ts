/**
 * Shared, dependency-free validation + constants for the team-invitations
 * feature (Equipo). Isomorphic (no `server-only` / `use client` directive) —
 * mirrors src/lib/registro/validation.ts's style so the client sheet and the
 * server action can never drift.
 */

/** Members per center, INCLUDING the Responsable ("N de 5 miembros"). */
export const MEMBER_CAP = 5;

export type TeamRole = "center_admin" | "center_member";

/** membership.role -> Spanish label (Responsable / Operador). */
export function roleLabel(role: TeamRole): string {
  return role === "center_admin" ? "Responsable" : "Operador";
}

export type ValidationResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/** Optional invite label ("Nombre"), ≤ 60 chars. Empty/blank -> null (valid). */
export function validateInviteLabel(
  raw: string | undefined | null,
): ValidationResult {
  const v = (raw ?? "").trim();
  if (v.length === 0) return { ok: true, value: null };
  if (v.length > 60) {
    return { ok: false, error: "El nombre no debe superar 60 caracteres." };
  }
  return { ok: true, value: v };
}

/** True when a center already holds the max member count. */
export function isCenterFull(memberCount: number): boolean {
  return memberCount >= MEMBER_CAP;
}

type InviteShape = {
  status: string;
  expiresAt: Date;
  centerStatus: string;
};

/**
 * True when an invitation is still safe to accept: pending, not expired, and
 * its center is approved. `now` defaults to `new Date()` — the codebase's
 * established pattern for the "current render time" in a Server Component
 * (e.g. `initialNow={new Date()}`), unlike `Date.now()`/bare `new Date()`
 * called as a standalone statement, which the react-hooks/purity rule flags
 * as an impure call when written directly in a component body. Generic over
 * `T` so the type predicate narrows away `null` WITHOUT collapsing the
 * caller's richer invite shape (centerName, memberCount, …) down to just
 * these three fields.
 */
export function isInviteUsable<T extends InviteShape>(
  invite: T | null,
  now: Date = new Date(),
): invite is T {
  return (
    invite !== null &&
    invite.status === "pending" &&
    invite.expiresAt.getTime() > now.getTime() &&
    invite.centerStatus === "approved"
  );
}
