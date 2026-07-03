// Non-action types for the (admin) moderation actions. These CANNOT live in
// moderation.ts: a "use server" file may export ONLY async functions
// (AGENTS.md gotcha #1). Import from here with `import type`.

/**
 * Max length of a moderation reason (reject / suspend). Shared so the client
 * sheets and the server-side re-validation agree on one bound. Lives here (not
 * in moderation.ts) because a "use server" file may export only async functions.
 */
export const REASON_MAX = 400;

export type ModerationDecision = "approved" | "rejected" | "suspended";

export type ModerationResult =
  | { ok: true; status: ModerationDecision }
  | { ok: false; error: string };
