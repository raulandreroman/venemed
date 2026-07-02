"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import { db } from "@/db/index";
import { request, shareEvent } from "@/db/schema";

export type ShareChannel =
  | "whatsapp"
  | "instagram"
  | "x"
  | "copy_link"
  | "unknown";

// RFC-4122 shape check — cheap reject before any DB/cache work.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Allowed ShareChannel values — runtime whitelist mirroring the type above. A
// "use server" file may export only async functions, so this stays module-local.
const SHARE_CHANNELS: readonly ShareChannel[] = [
  "whatsapp",
  "instagram",
  "x",
  "copy_link",
  "unknown",
];

// Decide whether this share (given the new share_count) should invalidate the
// cache. recordShare is public + unauthenticated, so calling revalidateTag on
// EVERY share lets anyone (or an organic share surge) bust the global donor-list
// cache repeatedly. We coalesce: invalidate only when the running count crosses a
// small set of early milestones, then once every REVALIDATE_EVERY shares after.
// The counter itself is always exact — only the (cheap-to-be-stale) cache refresh
// is throttled. Per-IP rate limiting is a follow-up (no KV/Upstash dep now).
const REVALIDATE_MILESTONES = new Set([1, 5, 25, 100]);
const REVALIDATE_EVERY = 100;

function shouldRevalidate(newCount: number): boolean {
  return REVALIDATE_MILESTONES.has(newCount) || newCount % REVALIDATE_EVERY === 0;
}

/**
 * Record a share for a request: bump `request.share_count` and append a
 * `share_event` row, then revalidate the detail + landing aggregate caches.
 *
 * Unauthenticated (any anonymous visitor can invoke it as an RPC), so writes are
 * guarded: a non-UUID id is rejected outright, and the counter bump doubles as an
 * existence + active-status gate (`UPDATE ... WHERE id = ? AND status = 'active'
 * RETURNING`). Only a confirmed active request triggers the event insert and the
 * `revalidateTag` calls — bounding writes and cache invalidation to real activity.
 */
export async function recordShare(
  requestId: string,
  channel: ShareChannel = "unknown",
): Promise<void> {
  if (!UUID_RE.test(requestId)) return; // not a real id — no writes, no revalidate

  // Reject an unknown channel outright (public RPC — never trust client input).
  // No throw: a bad channel shouldn't 500 the caller; just skip the write.
  if (!SHARE_CHANNELS.includes(channel)) return;

  const doRevalidate = await db.transaction(async (tx) => {
    // Bump the denormalized counter AND assert the request exists + is active in
    // one statement. RETURNING gives the new count (and whether anything hit).
    const bumped = await tx
      .update(request)
      .set({ shareCount: sql`${request.shareCount} + 1` })
      .where(and(eq(request.id, requestId), eq(request.status, "active")))
      .returning({ shareCount: request.shareCount });

    if (bumped.length === 0) return false; // unknown or non-active id → no event, no revalidate

    // Only now, for a confirmed active request, write the analytics row.
    await tx.insert(shareEvent).values({ requestId, channel });

    return shouldRevalidate(bumped[0].shareCount);
  });

  // Refresh the detail (share_count) + landing share aggregate — but only at
  // coalesced count milestones (see shouldRevalidate) so a share flood can't bust
  // the global donor-surge cache on every call. Done outside the tx.
  // Next 16 requires a cache-life profile as the 2nd arg ("max" =
  // stale-while-revalidate); the single-arg form is a deprecated TS error.
  if (doRevalidate) {
    revalidateTag(`request:${requestId}`, "max");
    revalidateTag("landing-stats", "max");
  }
}
