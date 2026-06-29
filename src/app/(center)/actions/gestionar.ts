"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { db } from "@/db";
import { request } from "@/db/schema";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import { requireCenter } from "@/lib/auth/require-center";
import { isWindowHours } from "@/lib/solicitudes/validation";

// NOTE: a "use server" module may export ONLY async functions (gotcha #1).
// `isWindowHours` is imported (a value, not re-exported) — fine.

/** Revalidate the donor surge reads touched by a center-side mutation (Next 16
 * two-arg "max" form, gotcha #3). The center dashboard/detail queries are
 * uncached, so a plain redirect already shows fresh data. */
function revalidateRequest(requestId: string): void {
  revalidateTag("active-requests", "max");
  revalidateTag("landing-stats", "max");
  revalidateTag(`request:${requestId}`, "max");
}

/**
 * Finalize (close) a solicitud the logged-in center owns: status → `closed`,
 * `closedReason = 'fulfilled'`, `closedAt = now()`. It then leaves the donor
 * active list + the dashboard "Solicitudes activas".
 *
 * Authorization derives from `requireCenter()` (session → membership → centerId);
 * a client-supplied id is never trusted — the row is loaded scoped by centerId,
 * and the UPDATE keeps the centerId predicate as defense-in-depth (Drizzle
 * bypasses RLS). Already-terminal rows (closed/expired) are a no-op. Ends in
 * `redirect(...)` (throws), so it must run after commit + revalidate.
 */
export async function finalizeRequest(requestId: string): Promise<void> {
  const current = await requireCenter();
  if (current.status !== "approved") {
    redirect(ROUTE_BY_STATUS[current.status] ?? "/centro/en-revision");
  }
  const { centerId } = current;

  const [row] = await db
    .select({ id: request.id, status: request.status })
    .from(request)
    .where(and(eq(request.id, requestId), eq(request.centerId, centerId)))
    .limit(1);
  if (!row) notFound();

  // Terminal-state guard: cannot finalize an already closed/expired request.
  if (row.status === "closed" || row.status === "expired") {
    redirect("/centro");
  }

  await db
    .update(request)
    .set({ status: "closed", closedReason: "fulfilled", closedAt: sql`now()` })
    .where(and(eq(request.id, requestId), eq(request.centerId, centerId)));

  revalidateRequest(requestId);

  // Redirect to the dashboard so the now-closed request visibly leaves "activas".
  redirect("/centro");
}

/**
 * Extend the window of a solicitud the logged-in center owns (Figma "Sheet ·
 * Extender ventana"): ADD the chosen +12/+24/+48 h to the current window —
 * `expiresAt += chosen`, `windowHours += chosen` (`publishedAt`/`status`
 * untouched). Same ownership + terminal-state guards as finalize — extending a
 * closed/expired request is meaningless. `hours` is re-validated server-side
 * (the action is a public POST).
 */
export async function extendWindow(
  requestId: string,
  hours: number,
): Promise<void> {
  const current = await requireCenter();
  if (current.status !== "approved") {
    redirect(ROUTE_BY_STATUS[current.status] ?? "/centro/en-revision");
  }
  const { centerId } = current;

  if (!isWindowHours(hours)) {
    throw new Error("Ventana de tiempo inválida.");
  }

  const [row] = await db
    .select({
      id: request.id,
      status: request.status,
      expiresAt: request.expiresAt,
      windowHours: request.windowHours,
    })
    .from(request)
    .where(and(eq(request.id, requestId), eq(request.centerId, centerId)))
    .limit(1);
  if (!row) notFound();

  if (row.status === "closed" || row.status === "expired") {
    redirect(`/centro/solicitudes/${requestId}`);
  }

  // ADD time to the current window (Figma "Sheet · Extender ventana": "Suma
  // tiempo extra") — not a reset. Bumping both expiresAt and windowHours by the
  // same amount keeps the detail progress bar's start (expiresAt − windowHours)
  // anchored at the original publish, so the bar simply gains remaining time.
  const base = row.expiresAt ?? new Date();
  const expiresAt = new Date(base.getTime() + hours * 3600 * 1000);
  const windowHours = (row.windowHours ?? 0) + hours;

  await db
    .update(request)
    .set({ windowHours, expiresAt })
    .where(and(eq(request.id, requestId), eq(request.centerId, centerId)));

  revalidateRequest(requestId);

  redirect(`/centro/solicitudes/${requestId}`);
}
