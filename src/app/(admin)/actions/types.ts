// Non-action types for the (admin) moderation actions. These CANNOT live in
// moderation.ts: a "use server" file may export ONLY async functions
// (AGENTS.md gotcha #1). Import from here with `import type`.

export type ModerationDecision = "approved" | "rejected" | "suspended";

export type ModerationResult =
  | { ok: true; status: ModerationDecision }
  | { ok: false; error: string };
