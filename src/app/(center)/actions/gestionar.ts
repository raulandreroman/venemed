"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { db } from "@/db";
import { center, lista } from "@/db/schema";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import { requireCenter } from "@/lib/auth/require-center";

// NOTE: a "use server" module may export ONLY async functions (gotcha #1).

/** Revalidate the donor surge reads touched by a center-side mutation (Next 16
 * two-arg "max" form, gotcha #3). The center dashboard/detail queries are
 * uncached, so a plain redirect already shows fresh data. */
function revalidateLista(listaId: string): void {
  revalidateTag("active-listas", "max");
  revalidateTag("landing-stats", "max");
  revalidateTag(`lista:${listaId}`, "max");
}

/**
 * Finalize (close) a lista the logged-in center owns: status → `closed`,
 * `closedReason = 'fulfilled'`, `closedAt = now()`. It then leaves the donor
 * active list + the dashboard "Solicitudes activas".
 *
 * Authorization derives from `requireCenter()` (session → membership → centerId);
 * a client-supplied id is never trusted — the row is loaded scoped by centerId,
 * and the UPDATE keeps the centerId predicate as defense-in-depth (Drizzle
 * bypasses RLS). An already-terminal row (closed) is a no-op. Ends in
 * `redirect(...)` (throws), so it must run after commit + revalidate.
 */
export async function finalizeLista(listaId: string): Promise<void> {
  const current = await requireCenter();
  if (current.status !== "approved") {
    redirect(ROUTE_BY_STATUS[current.status] ?? "/centro/en-revision");
  }
  const { centerId } = current;

  const [row] = await db
    .select({ id: lista.id, status: lista.status })
    .from(lista)
    .where(and(eq(lista.id, listaId), eq(lista.centerId, centerId)))
    .limit(1);
  if (!row) notFound();

  // Terminal-state guard: cannot finalize an already closed lista.
  if (row.status === "closed") {
    redirect("/centro");
  }

  await db
    .update(lista)
    .set({ status: "closed", closedReason: "fulfilled", closedAt: sql`now()` })
    .where(and(eq(lista.id, listaId), eq(lista.centerId, centerId)));

  revalidateLista(listaId);

  // Redirect to the dashboard so the now-closed lista visibly leaves "activas".
  redirect("/centro");
}

/**
 * Reactivate a `paused` (reception-off) or legacy `closed` lista the logged-in
 * center owns (Figma 8:1009 "Reactivar solicitud"): status → `active`, clears
 * `closedAt`/`closedReason`, `publishedAt = now`, resets `updatedAt` (freshness).
 * Ownership-scoped. If the center's reception is paused, reactivating ALSO
 * resumes reception (clears `reception_paused_at`) in the same transaction — the
 * UI shows a confirm dialog first (reactivate-button). An already-`active` lista
 * is a no-op (redirect to its detail). Revalidates the donor surge reads, then
 * back to /centro.
 */
export async function reactivateLista(listaId: string): Promise<void> {
  const current = await requireCenter();
  if (current.status !== "approved") {
    redirect(ROUTE_BY_STATUS[current.status] ?? "/centro/en-revision");
  }
  const { centerId } = current;

  const [row] = await db
    .select({ id: lista.id, status: lista.status })
    .from(lista)
    .where(and(eq(lista.id, listaId), eq(lista.centerId, centerId)))
    .limit(1);
  if (!row) notFound();

  // Already live → nothing to do; a paused/closed lista is what we reactivate.
  if (row.status === "active") {
    redirect(`/centro/lista/${listaId}`);
  }

  try {
    // One transaction: resume reception (if paused) + bring the lista back live.
    // Reactivating while reception is paused is intentional — the UI confirms
    // "esto reanudará la recepción" before calling.
    await db.transaction(async (tx) => {
      await tx
        .update(center)
        .set({ receptionPausedAt: null })
        .where(eq(center.id, centerId));

      await tx
        .update(lista)
        .set({
          status: "active",
          closedAt: null,
          closedReason: null,
          publishedAt: sql`now()`,
          // Reset the freshness clock too — otherwise a just-reactivated lista
          // keeps its old updatedAt and the ≥3d "sigue vigente?" card can appear
          // immediately (schema has no $onUpdate for this column).
          updatedAt: sql`now()`,
        })
        .where(and(eq(lista.id, listaId), eq(lista.centerId, centerId)));
    });
  } catch (err) {
    // 23505 on the one-active-per-center index (another lista already active) →
    // send the center to that live lista rather than surfacing a 500.
    if (!isUniqueViolation(err)) throw err;
    const [existing] = await db
      .select({ id: lista.id })
      .from(lista)
      .where(
        and(eq(lista.centerId, centerId), inArray(lista.status, ["active"])),
      )
      .limit(1);
    if (existing) redirect(`/centro/lista/${existing.id}`);
    redirect("/centro");
  }

  revalidateLista(listaId);

  redirect("/centro");
}

/** Postgres unique_violation (SQLSTATE 23505), as surfaced by postgres-js. */
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

/**
 * Reconfirm the logged-in center's evergreen lista is still current (the
 * dashboard's "¿Sigue vigente?" freshness card — appears once `updatedAt` is
 * ≥3 days old). A content-free touch: bumps `updatedAt` to now without
 * changing status or items. Resolves the center's single active|paused lista
 * server-side (never a client-supplied id); a no-op if none exists.
 *
 * Returns void (no redirect) — the caller does `router.refresh()`, and the
 * dashboard read is uncached so it re-renders with the bumped `updatedAt`
 * (the freshness card then evaluates false and disappears).
 */
export async function confirmVigente(): Promise<void> {
  const current = await requireCenter();
  if (current.status !== "approved") {
    redirect(ROUTE_BY_STATUS[current.status] ?? "/centro/en-revision");
  }
  const { centerId } = current;

  const [row] = await db
    .select({ id: lista.id })
    .from(lista)
    .where(
      and(eq(lista.centerId, centerId), inArray(lista.status, ["active", "paused"])),
    )
    .limit(1);
  if (!row) return;

  await db
    .update(lista)
    .set({ updatedAt: sql`now()` })
    .where(and(eq(lista.id, row.id), eq(lista.centerId, centerId)));

  revalidateLista(row.id);
}
