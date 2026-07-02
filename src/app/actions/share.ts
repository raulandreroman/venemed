"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";

import { db } from "@/db/index";
import { lista, shareChannel, shareEvent } from "@/db/schema";

export type ShareChannel =
  | "whatsapp"
  | "instagram"
  | "x"
  | "copy_link"
  | "unknown";

// RFC-4122 shape check — cheap reject before any DB/cache work.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Runtime allow-list of valid share channels (a client can pass anything to this
// unauthenticated RPC). Sourced from the pgEnum so it can't drift from the column.
const SHARE_CHANNELS = new Set<string>(shareChannel.enumValues);

// Cache invalidation is expensive under the donor surge, so decouple it from the
// per-call counter write: only revalidate at coarse share_count milestones
// (1/5/25/100, then every 100th) instead of on every single share.
function isRevalidationMilestone(shareCount: number): boolean {
  return (
    shareCount === 1 ||
    shareCount === 5 ||
    shareCount === 25 ||
    shareCount % 100 === 0
  );
}

/**
 * Record a share for a lista: bump `lista.share_count` and append a
 * `share_event` row, then revalidate the detail + landing aggregate caches.
 *
 * Unauthenticated (any anonymous visitor can invoke it as an RPC), so writes are
 * guarded: a non-UUID id is rejected outright, and the counter bump doubles as an
 * existence + active-status gate (`UPDATE ... WHERE id = ? AND status = 'active'
 * RETURNING`). Only a confirmed active lista triggers the event insert and the
 * `revalidateTag` calls — bounding writes and cache invalidation to real activity.
 */
export async function recordShare(
  requestId: string,
  channel: ShareChannel = "unknown",
): Promise<void> {
  if (!UUID_RE.test(requestId)) return; // not a real id — no writes, no revalidate
  if (!SHARE_CHANNELS.has(channel)) return; // bogus channel — no writes, no revalidate

  const shareCount = await db.transaction(async (tx) => {
    // Bump the denormalized counter AND assert the lista exists + is active in
    // one statement. RETURNING gives the new count (and whether anything was hit).
    const bumped = await tx
      .update(lista)
      .set({ shareCount: sql`${lista.shareCount} + 1` })
      .where(and(eq(lista.id, requestId), eq(lista.status, "active")))
      .returning({ shareCount: lista.shareCount });

    if (bumped.length === 0) return null; // unknown or non-active id → no event

    // Only now, for a confirmed active lista, write the analytics row.
    await tx.insert(shareEvent).values({ listaId: requestId, channel });

    return bumped[0].shareCount;
  });

  if (shareCount === null) return;

  // Refresh the detail (share_count) + the landing share aggregate only at coarse
  // milestones, so a share burst can't amplify into per-call cache invalidation.
  // Next 16 requires a cache-life profile as the 2nd arg ("max" =
  // stale-while-revalidate); the single-arg form is a deprecated TS error.
  // Follow-up: per-IP rate limiting / BotID to bound writes (no KV dep now).
  if (isRevalidationMilestone(shareCount)) {
    revalidateTag(`lista:${requestId}`, "max");
    revalidateTag("landing-stats", "max");
  }
}
