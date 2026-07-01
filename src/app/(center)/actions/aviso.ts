"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { db } from "@/db";
import { center, request, requestItem, supply } from "@/db/schema";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import { requireCenter } from "@/lib/auth/require-center";
import { categoryLabel } from "@/lib/format";
import { validateAviso, SIN_LIMITE } from "@/lib/aviso/validation";
import type { PublishAvisoInput } from "@/lib/aviso/validation";

// NOTE: a "use server" module may export ONLY async functions (gotcha #1).
// `PublishAvisoInput` is imported via `import type`; `validateAviso`/`SIN_LIMITE`
// are values (not re-exported). The helpers below are NOT exported.

type CenterRow = { centerId: string };

/**
 * Resolve session/authz for an aviso mutation. Only `approved` centers may
 * author an aviso (redirects others to their status screen). Returns the
 * centerId (a client-supplied id is never trusted — Drizzle bypasses RLS).
 */
async function requireApprovedCenter(): Promise<CenterRow> {
  const current = await requireCenter();
  if (current.status !== "approved") {
    redirect(ROUTE_BY_STATUS[current.status] ?? "/centro/en-revision");
  }
  return { centerId: current.centerId };
}

/** Bust the donor surge reads an aviso publish/edit/remove touches (Next 16
 * two-arg "max" form, gotcha #3). The center dashboard/detail queries are
 * uncached, so a plain redirect already shows the center its own write. */
function revalidateAviso(): void {
  revalidateTag("active-requests", "max");
  revalidateTag("landing-stats", "max");
}

/**
 * Resolve the window into stored columns. "Sin límite" → window_hours NULL +
 * expires_at NULL (never auto-cleared by the expiry cron — `null < now()` is
 * NULL, not true). Otherwise stamp a 12/24/48 h window from `now`.
 */
function resolveWindow(
  input: PublishAvisoInput,
  now: Date,
): { windowHours: number | null; expiresAt: Date | null } {
  if (input.windowChoice === SIN_LIMITE) {
    return { windowHours: null, expiresAt: null };
  }
  return {
    windowHours: input.windowChoice,
    expiresAt: new Date(now.getTime() + input.windowChoice * 3600 * 1000),
  };
}

/**
 * Map the selected items to `request_item` insert rows + derive the request's
 * denormalized `categories[]` (mirrors publicar.ts): each catalog supply carries
 * its supply_category; custom (free-text) items fall back to 'general'.
 */
async function buildItemsAndCategories(
  input: PublishAvisoInput,
  requestId: string,
): Promise<{
  itemRows: (typeof requestItem.$inferInsert)[];
  categories: string[];
}> {
  const supplyIds = input.items
    .map((it) => it.supplyId)
    .filter((id): id is string => !!id);
  const supplyRows = supplyIds.length
    ? await db
        .select({ id: supply.id, category: supply.category })
        .from(supply)
        .where(inArray(supply.id, supplyIds))
    : [];
  const categoryBySupply = new Map<string, string>(
    supplyRows.map((r) => [r.id, r.category]),
  );
  const hasCustom = input.items.some((it) => !it.supplyId);
  const categorySet = new Set<string>(supplyRows.map((r) => r.category));
  if (hasCustom || categorySet.size === 0) categorySet.add("general");

  const itemRows = input.items.map((it) => ({
    requestId,
    supplyId: it.supplyId ?? null,
    customName: it.supplyId ? null : it.customName?.trim() || null,
    category: categoryLabel(
      (it.supplyId && categoryBySupply.get(it.supplyId)) || "general",
    ),
  }));

  return { itemRows, categories: [...categorySet] };
}

/**
 * Publish a new aviso de exceso for the logged-in center. An aviso is a
 * request(kind='surplus', status='active') + its request_item rows; the reason
 * is stored in `title`. ONE active aviso per center: any existing active surplus
 * is closed first inside the transaction, and the partial unique index
 * (`request_one_active_surplus_per_center`) is the race backstop — a concurrent
 * double-publish raises 23505, treated as already-published. A paused-reception
 * center may not publish (consistent with publishRequest). Ends in redirect().
 */
export async function publishAviso(input: PublishAvisoInput): Promise<void> {
  const { centerId } = await requireApprovedCenter();

  const errors = validateAviso(input);
  if (Object.keys(errors).length > 0) {
    throw new Error("Aviso inválido.");
  }

  const [c] = await db
    .select({ city: center.city, receptionPausedAt: center.receptionPausedAt })
    .from(center)
    .where(eq(center.id, centerId))
    .limit(1);
  if (c?.receptionPausedAt) {
    throw new Error("La recepción de donaciones está pausada.");
  }

  const now = new Date();
  const { windowHours, expiresAt } = resolveWindow(input, now);
  const reason = input.reason?.trim() || null;

  try {
    await db.transaction(async (tx) => {
      // Close any existing active aviso first → at commit there is exactly one
      // active surplus, satisfying the partial unique index.
      await tx
        .update(request)
        .set({ status: "closed", closedReason: "cancelled", closedAt: now })
        .where(
          and(
            eq(request.centerId, centerId),
            eq(request.kind, "surplus"),
            eq(request.status, "active"),
          ),
        );

      const [inserted] = await tx
        .insert(request)
        .values({
          centerId,
          kind: "surplus",
          status: "active",
          title: reason,
          windowHours,
          publishedAt: now,
          expiresAt,
          city: c?.city ?? null,
          categories: [], // backfilled below once we know the id
          idempotencyKey: input.idempotencyKey,
        })
        .returning({ id: request.id });

      const { itemRows, categories } = await buildItemsAndCategories(
        input,
        inserted.id,
      );
      await tx
        .update(request)
        .set({ categories })
        .where(eq(request.id, inserted.id));
      await tx.insert(requestItem).values(itemRows);
    });
  } catch (err) {
    // A concurrent publish (idempotency-key OR the partial surplus index) — the
    // aviso is effectively published either way, so route to the dashboard.
    if (!isUniqueViolation(err)) throw err;
  }

  revalidateAviso();
  redirect("/centro");
}

/**
 * Edit an existing active aviso the logged-in center owns: re-author its reason
 * (`title`), window, and item list. Loaded scoped by (id, centerId,
 * kind='surplus'); a foreign/missing/non-surplus id is notFound(). The row stays
 * `active`, so no unique-index conflict. Items are replaced (delete-then-insert).
 */
export async function updateAviso(
  id: string,
  input: PublishAvisoInput,
): Promise<void> {
  const { centerId } = await requireApprovedCenter();

  const errors = validateAviso(input);
  if (Object.keys(errors).length > 0) {
    throw new Error("Aviso inválido.");
  }

  const [row] = await db
    .select({ id: request.id, status: request.status })
    .from(request)
    .where(
      and(
        eq(request.id, id),
        eq(request.centerId, centerId),
        eq(request.kind, "surplus"),
      ),
    )
    .limit(1);
  if (!row) notFound();
  // Only an active aviso is editable; a closed/expired one is re-issued via publish.
  if (row.status !== "active") redirect("/centro/aviso");

  const now = new Date();
  const { windowHours, expiresAt } = resolveWindow(input, now);
  const reason = input.reason?.trim() || null;
  const { itemRows, categories } = await buildItemsAndCategories(input, id);

  await db.transaction(async (tx) => {
    await tx
      .update(request)
      .set({
        title: reason,
        windowHours,
        publishedAt: now,
        expiresAt,
        categories,
      })
      .where(and(eq(request.id, id), eq(request.centerId, centerId)));

    await tx.delete(requestItem).where(eq(requestItem.requestId, id));
    await tx.insert(requestItem).values(itemRows);
  });

  revalidateAviso();
  redirect("/centro");
}

/**
 * Remove (close) the active aviso the logged-in center owns: status → 'closed',
 * closedReason → 'cancelled' (a surplus is never "fulfilled"). Closing frees the
 * partial unique index so the center can re-issue. This is the ONLY way a
 * "Sin límite" aviso clears (the expiry cron never touches a null expiry), so
 * it's load-bearing for indefinite avisos. Ownership-scoped; ends in redirect().
 */
export async function removeAviso(id: string): Promise<void> {
  const { centerId } = await requireApprovedCenter();

  const [row] = await db
    .select({ id: request.id, status: request.status })
    .from(request)
    .where(
      and(
        eq(request.id, id),
        eq(request.centerId, centerId),
        eq(request.kind, "surplus"),
      ),
    )
    .limit(1);
  if (!row) notFound();
  if (row.status !== "active") redirect("/centro");

  await db
    .update(request)
    .set({ status: "closed", closedReason: "cancelled", closedAt: new Date() })
    .where(
      and(
        eq(request.id, id),
        eq(request.centerId, centerId),
        eq(request.kind, "surplus"),
      ),
    );

  revalidateAviso();
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
