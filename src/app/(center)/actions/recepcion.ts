"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { center, lista } from "@/db/schema";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import { requireCenter } from "@/lib/auth/require-center";

// NOTE: a "use server" module may export ONLY async functions (gotcha #1). This
// file exports just `setReception`; no types/consts are exported.

/**
 * Center-level "Recepción de donaciones" kill-switch (center-workspace §3.4).
 *
 * `pause = true`  → stamp `center.reception_paused_at = now()` AND close ALL of
 *   this center's live requests (`active`/`paused`) as `closed` /
 *   `closedReason = 'cancelled'` / `closedAt = now()` (decision §5.2). With no
 *   active requests, the center naturally drops off the cached donor list.
 * `pause = false` → clear `reception_paused_at` only. It does NOT reopen the
 *   cancelled requests (decision §5.2) — the center re-publishes when ready.
 *
 * Authorization derives from `requireCenter()` (session → membership → centerId);
 * a client never supplies the id. Every write is centerId-scoped (Drizzle
 * bypasses RLS — center scoping is the only authorization). Ends in
 * `redirect(...)` (throws), so it runs after commit + revalidate. The profile /
 * dashboard queries are uncached, so the redirect shows the flipped state.
 */
export async function setReception(pause: boolean): Promise<void> {
  const current = await requireCenter();
  if (current.status !== "approved") {
    redirect(ROUTE_BY_STATUS[current.status] ?? "/centro/en-revision");
  }
  const { centerId } = current;

  if (pause) {
    // One transaction: pause the center + close all its live requests.
    const closed = await db.transaction(async (tx) => {
      await tx
        .update(center)
        .set({ receptionPausedAt: sql`now()` })
        .where(eq(center.id, centerId));

      return tx
        .update(lista)
        .set({
          status: "closed",
          closedReason: "cancelled",
          closedAt: sql`now()`,
        })
        .where(
          and(
            eq(lista.centerId, centerId),
            inArray(lista.status, ["active", "paused"]),
          ),
        )
        .returning({ id: lista.id });
    });

    // Invalidate the donor surge reads (Next 16 two-arg "max" form, gotcha #3).
    revalidateTag("active-listas", "max");
    revalidateTag("landing-stats", "max");
    for (const r of closed) revalidateTag(`lista:${r.id}`, "max");
  } else {
    await db
      .update(center)
      .set({ receptionPausedAt: null })
      .where(eq(center.id, centerId));

    // Resume changes nothing donor-visible (the closed listas stay closed),
    // but revalidating the surge tags is cheap + keeps the list authoritative.
    revalidateTag("active-listas", "max");
    revalidateTag("landing-stats", "max");
  }

  redirect("/centro/perfil");
}
