"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { center, lista } from "@/db/schema";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import { requireResponsable } from "@/lib/auth/require-responsable";

// NOTE: a "use server" module may export ONLY async functions (gotcha #1). This
// file exports just `setReception`; no types/consts are exported.

/**
 * Center-level "Recepción de donaciones" kill-switch (center-workspace §3.4).
 *
 * `pause = true`  → stamp `center.reception_paused_at = now()` AND set this
 *   center's `active` lista(s) to `paused` (decision §5.2). A `paused` lista is
 *   PRESERVED (not closed): it drops off the cached donor list — which filters
 *   `status = 'active'` — but still shows on the center dashboard so nothing is
 *   lost.
 * `pause = false` → clear `reception_paused_at` AND flip this center's `paused`
 *   lista(s) back to `active`, resetting `updatedAt` (freshness) so the restored
 *   lista reappears to donors immediately (decision §5.2). Legacy `closed`
 *   rows (from the old close-on-pause behavior) stay closed — the center
 *   reactivates those via the "Reactivar lista" button.
 *
 * Authorization derives from `requireResponsable()` (session → membership →
 * centerId, Responsable-only — an Operador is bounced to /centro); a client
 * never supplies the id. Every write is centerId-scoped (Drizzle bypasses RLS —
 * center scoping is the only authorization). Ends in `redirect(...)` (throws),
 * so it runs after commit + revalidate. The profile / dashboard queries are
 * uncached, so the redirect shows the flipped state.
 */
export async function setReception(pause: boolean): Promise<void> {
  const current = await requireResponsable();
  if (current.status !== "approved") {
    redirect(ROUTE_BY_STATUS[current.status] ?? "/centro/en-revision");
  }
  const { centerId } = current;

  if (pause) {
    // One transaction: pause the center + pause (hide, don't close) its live listas.
    const affected = await db.transaction(async (tx) => {
      await tx
        .update(center)
        .set({ receptionPausedAt: sql`now()` })
        .where(eq(center.id, centerId));

      return tx
        .update(lista)
        .set({ status: "paused" })
        .where(
          and(eq(lista.centerId, centerId), inArray(lista.status, ["active"])),
        )
        .returning({ id: lista.id });
    });

    // Invalidate the donor surge reads (Next 16 two-arg "max" form, gotcha #3).
    revalidateTag("active-listas", "max");
    revalidateTag("landing-stats", "max");
    for (const r of affected) revalidateTag(`lista:${r.id}`, "max");
  } else {
    // One transaction: resume the center + restore its paused listas to active
    // (reset freshness so a restored lista isn't instantly stale).
    const affected = await db.transaction(async (tx) => {
      await tx
        .update(center)
        .set({ receptionPausedAt: null })
        .where(eq(center.id, centerId));

      return tx
        .update(lista)
        .set({ status: "active", updatedAt: sql`now()` })
        .where(
          and(eq(lista.centerId, centerId), inArray(lista.status, ["paused"])),
        )
        .returning({ id: lista.id });
    });

    revalidateTag("active-listas", "max");
    revalidateTag("landing-stats", "max");
    for (const r of affected) revalidateTag(`lista:${r.id}`, "max");
  }

  redirect("/centro/perfil");
}
