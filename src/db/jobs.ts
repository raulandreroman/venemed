import "server-only";

import { and, inArray, lt, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import { db } from "./index";
import { moderationEvent, request } from "./schema";

/**
 * Expiry cron core (see docs/specs/cron-jobs.md §3).
 *
 * Flips every `active`/`paused` request whose window has lapsed to `expired`,
 * writes one append-only `moderation_event` per flipped row, then revalidates
 * exactly the caches that referenced those rows.
 *
 * Concurrency-safe + idempotent by construction: the `WHERE` clause excludes
 * already-terminal rows, so overlapping ticks flip nothing extra and a re-run
 * processes zero rows. The DB clock (`now()`) is the single source of truth, so
 * app/server clock skew is irrelevant.
 */
export async function expireDueRequests(): Promise<{ expired: number }> {
  // Expire + audit must commit together (cron-jobs.md §4): if the audit insert
  // failed after a separate UPDATE commit, the idempotent WHERE would never
  // re-flip those rows, losing their audit trail permanently.
  const flipped = await db.transaction(async (tx) => {
    // Single mutation, RETURNING the flipped ids for audit + targeted revalidation.
    const rows = await tx
      .update(request)
      .set({
        status: "expired",
        closedAt: sql`now()`,
        closedReason: "expired",
      })
      .where(
        and(
          inArray(request.status, ["active", "paused"]),
          lt(request.expiresAt, sql`now()`),
        ),
      )
      .returning({ id: request.id });

    if (rows.length === 0) return rows; // empty run: nothing to audit

    // Bulk audit: one event per flipped request (actor null = system/cron).
    await tx.insert(moderationEvent).values(
      rows.map((r) => ({
        actorUserId: null,
        subjectType: "request" as const,
        subjectId: r.id,
        action: "expired_by_cron",
      })),
    );

    return rows;
  });

  if (flipped.length === 0) return { expired: 0 }; // empty run: nothing to revalidate

  // Refresh donor feed + landing aggregate, plus each affected detail page.
  // Only after the expire+audit transaction has committed.
  // Next 16.2.9 requires a cache-life profile as the 2nd arg ("max"); the
  // single-arg form is a TS error.
  revalidateTag("active-requests", "max");
  revalidateTag("landing-stats", "max");
  for (const r of flipped) {
    revalidateTag(`request:${r.id}`, "max");
  }

  return { expired: flipped.length };
}
