"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { center, lista, listaItem, supply, supplyCategory } from "@/db/schema";
import { requireCenter } from "@/lib/auth/require-center";
import { ROUTE_BY_STATUS } from "@/lib/auth/on-login";
import { categoryLabel } from "@/lib/format";
<<<<<<< HEAD
import { isValidQuantity, validatePublishLista } from "@/lib/listas/validation";
=======
import {
  RECEPTION_LANDMARK_MAX,
  RECEPTION_NAME_MAX,
  validatePublishLista,
} from "@/lib/listas/validation";
>>>>>>> feat/insight-reception-contact
import type { PublishListaInput } from "@/lib/listas/validation";
import { normalizeVePhone } from "@/lib/registro/validation";

// NOTE: a "use server" module may export ONLY async functions (gotcha #1).
// `PublishListaInput` is imported via `import type` above — never re-exported.

/**
 * Publish (create OR edit) the logged-in center's single evergreen lista
 * (lista-model-v2: one live lista per center, no windows). Authorization
 * derives from `requireCenter()` (session → membership → centerId); a
 * client-supplied center id is never trusted (Drizzle bypasses RLS). Only
 * `approved` centers may publish. The full payload is re-validated
 * server-side (defense-in-depth).
 *
 * Resolves the center's existing `active|paused` row first: if found, this is
 * an EDIT (last-write-wins — update the lista's fields + fully replace its
 * items); otherwise it's a CREATE. Keyed by `idempotencyKey` on create so a
 * double-submit dedupes (23505 → re-resolve and proceed to the confirm
 * screen). Then revalidates the donor surge tags (2-arg form, Next 16) and
 * redirects to the published-confirm screen. Ends in `redirect(...)`; never
 * returns on the happy path (redirect throws).
 */
export async function publishLista(input: PublishListaInput): Promise<void> {
  // (1) Resolve session/authz. Only approved centers publish.
  const current = await requireCenter();
  if (current.status !== "approved") {
    redirect(ROUTE_BY_STATUS[current.status] ?? "/centro/en-revision");
  }
  const { centerId } = current;

  // (2) Re-validate (defense-in-depth — a "use server" action is a public POST).
  const errors = validatePublishLista(input);
  if (Object.keys(errors).length > 0) {
    throw new Error("Lista inválida.");
  }

  // (3) Denormalize city from the center (requireCenter doesn't carry it).
  // Also read the reception switch: a paused center may not publish (slice 3.4)
  // — publishing would re-populate the donor list the kill-switch just cleared.
  const [c] = await db
    .select({ city: center.city, receptionPausedAt: center.receptionPausedAt })
    .from(center)
    .where(eq(center.id, centerId))
    .limit(1);

  if (c?.receptionPausedAt) {
    throw new Error("La recepción de donaciones está pausada.");
  }

  // (3b) Derive categories from ALL chosen items (need + excess) — the "área"
  // facet was dropped from authoring. Each catalog supply carries its
  // supply_category; a free-text custom now carries its PICKED category
  // (field-insight-whatsapp §2), defaulting to 'general' ("Otros") when the
  // center skipped the picker. Unknown values are coerced to 'general'.
  const allowedCategories = new Set<string>(supplyCategory.enumValues);
  const customCategory = (raw?: string): string =>
    raw && allowedCategories.has(raw) ? raw : "general";

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
  const categorySet = new Set<string>(supplyRows.map((r) => r.category));
  for (const it of input.items) {
    if (!it.supplyId) categorySet.add(customCategory(it.category));
  }
  if (categorySet.size === 0) categorySet.add("general");
  const categories = [...categorySet]; // English enum values (donor filters arrayContains)

  const deliveryInstructions = input.deliveryInstructions?.trim() || null;
  const excessReason = input.excessReason?.trim() || null;
  // Reception contact (field-insight §3) — trim + length-cap the strings,
  // normalize the phone to E.164. All optional; empty → null.
  const receptionContactName =
    input.receptionContactName?.trim().slice(0, RECEPTION_NAME_MAX) || null;
  const receptionLandmark =
    input.receptionLandmark?.trim().slice(0, RECEPTION_LANDMARK_MAX) || null;
  const receptionContactPhone = normalizeVePhone(input.receptionContactPhone);

  const itemValues = (targetListaId: string) =>
    input.items.map((it) => ({
      listaId: targetListaId,
      supplyId: it.supplyId ?? null,
      customName: it.supplyId ? null : it.customName?.trim() || null,
      bucket: it.bucket,
      // excess items are never urgent — coerce regardless of client input.
      isUrgent: it.bucket === "need" ? !!it.isUrgent : false,
      // Optional quantity, need-bucket only; excess is always null (§1).
      quantity:
        it.bucket === "need" && isValidQuantity(it.quantity)
          ? it.quantity
          : null,
      // lista_item.category is the Spanish label; catalog items use their
      // supply's category, customs use their picked category (default general).
      category: categoryLabel(
        it.supplyId
          ? categoryBySupply.get(it.supplyId) || "general"
          : customCategory(it.category),
      ),
    }));

  // (4) Resolve the center's existing evergreen lista (at most one, enforced
  // by lista_one_active_per_center).
  const [existing] = await db
    .select({ id: lista.id })
    .from(lista)
    .where(
      and(eq(lista.centerId, centerId), inArray(lista.status, ["active", "paused"])),
    )
    .limit(1);

  let listaId: string;

  if (existing) {
    // (5a) EDIT — last-write-wins: update fields, then fully replace items.
    listaId = existing.id;
    await db.transaction(async (tx) => {
      await tx
        .update(lista)
        .set({
          deliveryInstructions,
          excessReason,
          receptionContactName,
          receptionContactPhone,
          receptionLandmark,
          city: c?.city ?? null,
          categories,
          updatedAt: sql`now()`,
        })
        .where(and(eq(lista.id, existing.id), eq(lista.centerId, centerId)));

      await tx.delete(listaItem).where(eq(listaItem.listaId, existing.id));
      await tx.insert(listaItem).values(itemValues(existing.id));
    });
  } else {
    // (5b) CREATE — first lista for this center.
    try {
      listaId = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(lista)
          .values({
            centerId,
            status: "active",
            deliveryInstructions,
            excessReason,
            receptionContactName,
            receptionContactPhone,
            receptionLandmark,
            publishedAt: sql`now()`,
            city: c?.city ?? null,
            categories,
            idempotencyKey: input.idempotencyKey,
          })
          .returning({ id: lista.id });

        await tx.insert(listaItem).values(itemValues(inserted.id));

        return inserted.id;
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // 23505 on either the idempotency key (a retried double-submit) or the
      // one-active-per-center index (a concurrent create racing this one) —
      // either way, re-resolve the center's now-existing evergreen lista and
      // proceed to the confirm screen rather than surfacing an error.
      const [byIdempotency] = await db
        .select({ id: lista.id })
        .from(lista)
        .where(
          and(
            eq(lista.centerId, centerId),
            eq(lista.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      const [byCenter] = byIdempotency
        ? []
        : await db
            .select({ id: lista.id })
            .from(lista)
            .where(
              and(
                eq(lista.centerId, centerId),
                inArray(lista.status, ["active", "paused"]),
              ),
            )
            .limit(1);
      const resolved = byIdempotency ?? byCenter;
      if (!resolved) throw err;
      listaId = resolved.id;
    }
  }

  // (6) Invalidate the cached donor surge reads (Next 16 two-arg form). The
  // center dashboard queries are uncached, so they reflect the write already.
  revalidateTag("active-listas", "max");
  revalidateTag("landing-stats", "max");
  revalidateTag(`lista:${listaId}`, "max");

  // (7) Redirect AFTER commit + revalidate (redirect throws). Shows
  // "¡Lista publicada!" for both a create and an edit — no separate "updated"
  // screen exists in the frames.
  redirect(`/centro/lista/${listaId}/publicada`);
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
