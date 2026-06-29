"use server";

import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { center, request, requestItem } from "@/db/schema";
import { requireCenter } from "@/lib/auth/require-center";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import { categoryLabel } from "@/lib/format";
import { validatePublishRequest } from "@/lib/solicitudes/validation";
import type { PublishRequestInput } from "@/lib/solicitudes/validation";

// NOTE: a "use server" module may export ONLY async functions (gotcha #1).
// `PublishRequestInput` is imported via `import type` above — never re-exported.

/**
 * Publish a need solicitud for the logged-in center. Authorization derives from
 * `requireCenter()` (session → membership → centerId); a client-supplied center
 * id is never trusted (Drizzle bypasses RLS). Only `approved` centers may
 * publish. The full payload is re-validated server-side (defense-in-depth).
 *
 * One transaction inserts the `request` (status `active`, window stamped) plus
 * its `request_item` rows, keyed by `idempotencyKey` so a double-submit dedupes
 * (23505 → re-resolve the existing request and proceed to the confirm screen).
 * Then revalidates the donor surge tags (2-arg form, Next 16) and redirects to
 * the published-confirm screen. Ends in `redirect(...)`; never returns on happy
 * path (redirect throws).
 */
export async function publishRequest(
  input: PublishRequestInput,
): Promise<void> {
  // (1) Resolve session/authz. Only approved centers publish.
  const current = await requireCenter();
  if (current.status !== "approved") {
    redirect(ROUTE_BY_STATUS[current.status] ?? "/centro/en-revision");
  }
  const { centerId } = current;

  // (2) Re-validate (defense-in-depth — a "use server" action is a public POST).
  const errors = validatePublishRequest(input);
  if (Object.keys(errors).length > 0) {
    throw new Error("Solicitud inválida.");
  }

  // (3) Denormalize city from the center (requireCenter doesn't carry it).
  const [c] = await db
    .select({ city: center.city })
    .from(center)
    .where(eq(center.id, centerId))
    .limit(1);

  const area = input.area;
  const categorySpanish = categoryLabel(area); // request_item.category is the Spanish label
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.windowHours * 3600 * 1000);

  // (4) Transaction: insert request + items, keyed by idempotencyKey.
  let requestId: string;
  try {
    requestId = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(request)
        .values({
          centerId,
          kind: "need",
          status: "active",
          title: input.title.trim(),
          deliveryInstructions: input.deliveryInstructions?.trim() || null,
          windowHours: input.windowHours,
          publishedAt: now,
          expiresAt,
          city: c?.city ?? null,
          categories: [area], // English enum value (donor filters arrayContains this)
          idempotencyKey: input.idempotencyKey,
        })
        .returning({ id: request.id });

      await tx.insert(requestItem).values(
        input.items.map((it) => ({
          requestId: inserted.id,
          supplyId: it.supplyId ?? null,
          customName: it.supplyId ? null : it.customName?.trim() || null,
          category: categorySpanish,
        })),
      );

      return inserted.id;
    });
  } catch (err) {
    // Idempotency-key unique violation: a prior submit already created this
    // request. Re-resolve it (scoped to this center) and proceed to confirm.
    if (isUniqueViolation(err)) {
      const [existing] = await db
        .select({ id: request.id })
        .from(request)
        .where(eq(request.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (!existing) throw err;
      requestId = existing.id;
    } else {
      throw err;
    }
  }

  // (5) Invalidate the cached donor surge reads (Next 16 two-arg form). The
  // center dashboard queries are uncached, so they reflect the write already.
  revalidateTag("active-requests", "max");
  revalidateTag("landing-stats", "max");
  revalidateTag(`request:${requestId}`, "max");

  // (6) Redirect AFTER commit + revalidate (redirect throws).
  redirect(`/centro/solicitudes/${requestId}/publicada`);
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
