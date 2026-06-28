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

  await db.transaction(async (tx) => {
    // Bump the denormalized counter AND assert the request exists + is active in
    // one statement. RETURNING tells us whether anything was actually affected.
    const bumped = await tx
      .update(request)
      .set({ shareCount: sql`${request.shareCount} + 1` })
      .where(and(eq(request.id, requestId), eq(request.status, "active")))
      .returning({ id: request.id });

    if (bumped.length === 0) return; // unknown or non-active id → no event, no revalidate

    // Only now, for a confirmed active request, write the analytics row...
    await tx.insert(shareEvent).values({ requestId, channel });

    // ...and refresh the detail (share_count) + the landing share aggregate.
    // Next 16 requires a cache-life profile as the 2nd arg ("max" =
    // stale-while-revalidate); the single-arg form is a deprecated TS error.
    revalidateTag(`request:${requestId}`, "max");
    revalidateTag("landing-stats", "max");
  });
}
