import "server-only";
import { randomBytes, createHash } from "node:crypto";

/**
 * Invite-link token helpers. This is a PLAIN server module (no `"use server"`
 * directive) — it is imported by `"use server"` action files but must never be
 * one itself, since a server-actions file may export only async functions
 * (AGENTS.md gotcha #1). Keep these exports non-async and out of any
 * `"use server"` boundary.
 *
 * SECURITY: the raw token is a CSPRNG value that appears ONLY in the invite
 * URL — it is never persisted to the DB and never logged. Only its SHA-256
 * hash is stored (`invitation.token_hash`, unique-indexed), so a DB leak alone
 * cannot be used to mint a working invite link. Lookups are always by exact
 * hash equality on that unique index — never a raw-string comparison.
 */

/** 32 random bytes, base64url-encoded (URL-safe, no padding). */
export function generateInviteToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashInviteToken(raw) };
}

/** SHA-256 hex digest of a raw invite token. */
export function hashInviteToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
