import "server-only";

import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "./index";
import { appUser, center, lista, listaItem, supply } from "./schema";

// ---- shared types ----------------------------------------------------------

export type ListaSort = "recent"; // Reciente

export type ListaFilters = {
  search?: string; // matches center name, city, or item name
  city?: string; // lista.city
  type?: string; // center.type enum value
  category?: string; // a value present in lista.categories[]
  sort?: ListaSort; // default "recent"
};

export type ListaItemData = {
  id: string;
  name: string; // supply.name ?? custom_name
  category: string; // lista_item.category (already Spanish)
};

export type ListaCardData = {
  id: string;
  city: string | null;
  centerName: string;
  centerDescription: string | null;
  centerType: string | null;
  publishedAt: Date | null;
  categories: string[] | null;
  items: ListaItemData[];
};

export type ListaDetailData = ListaCardData & {
  status: "active" | "paused" | "closed" | "draft";
  deliveryInstructions: string | null; // per-lista drop-off note
  closedAt: Date | null;
  closedReason: "fulfilled" | "cancelled" | null;
  shareCount: number;
  center: {
    name: string;
    description: string | null;
    city: string;
    type: string | null;
    addressLine: string | null;
    addressReference: string | null;
    regularScheduleText: string | null;
  };
  items: (ListaItemData & { isFulfilled: boolean })[];
};

export type LandingStats = {
  activeRequests: number;
  approvedCenters: number;
  lastUpdated: Date | null;
};

export type CenterListaStatus = "active" | "paused" | "closed" | "draft";

/** A center's own lista, for the back-office dashboard card. */
export type CenterListaCardData = {
  id: string;
  shortId: number; // human-friendly global display id → "#1044"
  status: CenterListaStatus;
  city: string | null;
  categories: string[] | null;
  publishedAt: Date | null;
  shareCount: number;
  closedReason: "fulfilled" | "cancelled" | null;
  createdAt: Date;
  items: ListaItemData[];
};

/**
 * A center-owned lista enriched for the center DETAIL screen: the card data
 * plus the per-lista drop-off note and the center's address/schedule (joined
 * from `center`, since requireCenter() doesn't carry them). Superset of
 * CenterListaCardData, so the dashboard/publicada card consumers stay
 * compatible.
 */
export type CenterListaDetailData = CenterListaCardData & {
  deliveryInstructions: string | null;
  center: {
    addressLine: string | null;
    addressReference: string | null;
    regularScheduleText: string | null;
  };
};

// ---- 4.1 getActiveListas ----------------------------------------------------

async function queryActiveListas(
  filters: ListaFilters,
): Promise<ListaCardData[]> {
  const search = filters.search?.trim();

  const rows = await db
    .select({
      id: lista.id,
      centerId: lista.centerId,
      city: lista.city,
      categories: lista.categories,
      publishedAt: lista.publishedAt,
      centerName: center.name,
      centerDescription: center.description,
      centerType: center.type,
    })
    .from(lista)
    .innerJoin(center, eq(center.id, lista.centerId))
    .where(
      and(
        eq(lista.status, "active"),
        eq(center.status, "approved"),
        filters.city ? eq(lista.city, filters.city) : undefined,
        filters.type
          ? eq(center.type, filters.type as typeof center.type.enumValues[number])
          : undefined,
        filters.category
          ? arrayContains(lista.categories, [filters.category])
          : undefined,
        search
          ? or(
              ilike(center.name, `%${search}%`),
              ilike(lista.city, `%${search}%`),
              sql`EXISTS (
                SELECT 1 FROM ${listaItem} li
                LEFT JOIN ${supply} s ON s.id = li.supply_id
                WHERE li.lista_id = ${lista.id}
                  AND (s.name ILIKE ${"%" + search + "%"}
                       OR li.custom_name ILIKE ${"%" + search + "%"})
              )`,
            )
          : undefined,
      ),
    )
    .orderBy(desc(lista.publishedAt)); // Reciente: newest first (only sort)

  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({
          id: listaItem.id,
          listaId: listaItem.listaId,
          name: sql<string>`coalesce(${supply.name}, ${listaItem.customName})`,
          category: listaItem.category,
        })
        .from(listaItem)
        .leftJoin(supply, eq(supply.id, listaItem.supplyId))
        .where(inArray(listaItem.listaId, ids))
        .orderBy(asc(listaItem.createdAt))
    : [];

  const itemsByLista = new Map<string, ListaItemData[]>();
  for (const it of items) {
    const list = itemsByLista.get(it.listaId) ?? [];
    list.push({ id: it.id, name: it.name, category: it.category });
    itemsByLista.set(it.listaId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    city: r.city,
    centerName: r.centerName,
    centerDescription: r.centerDescription,
    centerType: r.centerType,
    publishedAt: r.publishedAt,
    categories: r.categories,
    items: itemsByLista.get(r.id) ?? [],
  }));
}

/**
 * Live donor feed: active listas from approved centers.
 * Cached via unstable_cache keyed on the normalized filters; tag "active-listas".
 */
export function getActiveListas(
  filters: ListaFilters = {},
): Promise<ListaCardData[]> {
  const normalized: ListaFilters = {
    search: filters.search?.trim().toLowerCase() || undefined,
    city: filters.city || undefined,
    type: filters.type || undefined,
    category: filters.category || undefined,
    sort: "recent",
  };
  const key = JSON.stringify(normalized);
  return unstable_cache(
    () => queryActiveListas(normalized),
    ["active-listas", key],
    { revalidate: 60, tags: ["active-listas"] },
  )();
}

// ---- 4.2 getListaById --------------------------------------------------------

async function queryListaById(id: string): Promise<ListaDetailData | null> {
  const [r] = await db
    .select({
      id: lista.id,
      centerId: lista.centerId,
      status: lista.status,
      city: lista.city,
      deliveryInstructions: lista.deliveryInstructions,
      categories: lista.categories,
      publishedAt: lista.publishedAt,
      closedAt: lista.closedAt,
      closedReason: lista.closedReason,
      shareCount: lista.shareCount,
      centerName: center.name,
      centerDescription: center.description,
      centerCity: center.city,
      centerType: center.type,
      addressLine: center.addressLine,
      addressReference: center.addressReference,
      regularScheduleText: center.regularScheduleText,
    })
    .from(lista)
    .innerJoin(center, eq(center.id, lista.centerId))
    .where(
      and(
        eq(lista.id, id),
        eq(center.status, "approved"),
        inArray(lista.status, ["active", "closed"]),
      ),
    )
    .limit(1);

  if (!r) return null;

  const items = await db
    .select({
      id: listaItem.id,
      name: sql<string>`coalesce(${supply.name}, ${listaItem.customName})`,
      category: listaItem.category,
      isFulfilled: listaItem.isFulfilled,
    })
    .from(listaItem)
    .leftJoin(supply, eq(supply.id, listaItem.supplyId))
    .where(eq(listaItem.listaId, id))
    .orderBy(asc(listaItem.createdAt));

  return {
    id: r.id,
    city: r.city,
    deliveryInstructions: r.deliveryInstructions,
    status: r.status,
    centerName: r.centerName,
    centerDescription: r.centerDescription,
    centerType: r.centerType,
    publishedAt: r.publishedAt,
    categories: r.categories,
    closedAt: r.closedAt,
    closedReason: r.closedReason,
    shareCount: r.shareCount,
    center: {
      name: r.centerName,
      description: r.centerDescription,
      city: r.centerCity,
      type: r.centerType,
      addressLine: r.addressLine,
      addressReference: r.addressReference,
      regularScheduleText: r.regularScheduleText,
    },
    items,
  };
}

/**
 * Single lista for the detail page. Returns null for draft/paused/not-found
 * so the page can call notFound(). Cached; tags "active-listas" and "lista:<id>".
 */
export function getListaById(id: string): Promise<ListaDetailData | null> {
  return unstable_cache(() => queryListaById(id), ["lista", id], {
    revalidate: 60,
    tags: ["active-listas", `lista:${id}`],
  })();
}

// ---- 4.3 getLandingStats ---------------------------------------------------

async function queryLandingStats(): Promise<LandingStats> {
  const [activeRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(lista)
    .where(eq(lista.status, "active"));

  const [centersRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(center)
    .where(eq(center.status, "approved"));

  const [lastRow] = await db
    .select({ last: sql<string | null>`max(${lista.publishedAt})` })
    .from(lista)
    .where(eq(lista.status, "active"));

  return {
    activeRequests: activeRow?.count ?? 0,
    approvedCenters: centersRow?.count ?? 0,
    lastUpdated: lastRow?.last ? new Date(lastRow.last) : null,
  };
}

/** Landing live-stat aggregates. Cached; tags "landing-stats". */
export function getLandingStats(): Promise<LandingStats> {
  return unstable_cache(queryLandingStats, ["landing-stats"], {
    revalidate: 60,
    tags: ["landing-stats"],
  })();
}

// ---- 4.4 center dashboard (PRIVATE, uncached) ------------------------------
//
// These two are CENTER-PRIVATE: scoped by the logged-in center's id (resolved
// server-side via requireCenter — never a client id) and authorized by that
// single centerId predicate (Drizzle bypasses RLS). They are deliberately NOT
// wrapped in unstable_cache and carry NONE of the donor surge tags
// (active-listas / landing-stats / lista:<id>) so the dashboard reflects
// the center's own writes immediately.

/**
 * A single item row on the center dashboard v2 (lista-model-v2 §3c): bucket
 * (need|excess) + isUrgent drive the Urgente/Necesitamos/No aceptamos section
 * split, done in the component, not here.
 */
export type CenterListaItem = {
  id: string;
  name: string;
  category: string;
  bucket: "need" | "excess";
  isUrgent: boolean;
};

export type CenterDashboardLista = {
  id: string;
  shortId: number;
  status: "active" | "paused";
  city: string | null;
  updatedAt: Date;
  items: CenterListaItem[];
};

/**
 * The center's single evergreen lista (active|paused), for the dashboard v2.
 * The partial unique index `lista_one_active_per_center` guarantees at most
 * one row; returns null when the center hasn't published yet. Center-private
 * + uncached (same contract as the rest of §4.4).
 */
export async function getCenterDashboardLista(
  centerId: string,
): Promise<CenterDashboardLista | null> {
  const [row] = await db
    .select({
      id: lista.id,
      shortId: lista.shortId,
      status: lista.status,
      city: lista.city,
      updatedAt: lista.updatedAt,
    })
    .from(lista)
    .where(
      and(eq(lista.centerId, centerId), inArray(lista.status, ["active", "paused"])),
    )
    .limit(1);

  if (!row) return null;

  const items = await db
    .select({
      id: listaItem.id,
      name: sql<string>`coalesce(${supply.name}, ${listaItem.customName})`,
      category: listaItem.category,
      bucket: listaItem.bucket,
      isUrgent: listaItem.isUrgent,
    })
    .from(listaItem)
    .leftJoin(supply, eq(supply.id, listaItem.supplyId))
    .where(eq(listaItem.listaId, row.id))
    .orderBy(asc(listaItem.createdAt));

  return {
    id: row.id,
    shortId: row.shortId,
    // `where status in (...)` guarantees this at runtime; narrow for tsc.
    status: row.status as "active" | "paused",
    city: row.city,
    updatedAt: row.updatedAt,
    items,
  };
}

/** One pre-fillable item for the editor, keyed to match InsumoSelector's
 * `key` scheme (supplyId, or `custom:${lowercased name}`). */
export type CenterEditableItem = {
  key: string;
  supplyId?: string;
  name: string;
  bucket: "need" | "excess";
  isUrgent: boolean;
};

export type CenterEditableLista = {
  id: string;
  deliveryInstructions: string | null;
  excessReason: string | null;
  items: CenterEditableItem[];
};

/**
 * The center's single evergreen lista (active|paused), shaped for the editor
 * pre-fill (create-once → edit). Returns null when the center hasn't
 * published yet (the editor then starts blank). Center-private + uncached.
 */
export async function getCenterListaForEdit(
  centerId: string,
): Promise<CenterEditableLista | null> {
  const [row] = await db
    .select({
      id: lista.id,
      deliveryInstructions: lista.deliveryInstructions,
      excessReason: lista.excessReason,
    })
    .from(lista)
    .where(
      and(eq(lista.centerId, centerId), inArray(lista.status, ["active", "paused"])),
    )
    .limit(1);

  if (!row) return null;

  const rows = await db
    .select({
      supplyId: listaItem.supplyId,
      name: sql<string>`coalesce(${supply.name}, ${listaItem.customName})`,
      bucket: listaItem.bucket,
      isUrgent: listaItem.isUrgent,
    })
    .from(listaItem)
    .leftJoin(supply, eq(supply.id, listaItem.supplyId))
    .where(eq(listaItem.listaId, row.id))
    .orderBy(asc(listaItem.createdAt));

  const items: CenterEditableItem[] = rows.map((r) => ({
    key: r.supplyId ?? `custom:${r.name.toLowerCase()}`,
    supplyId: r.supplyId ?? undefined,
    name: r.name,
    bucket: r.bucket,
    isUrgent: r.isUrgent,
  }));

  return {
    id: row.id,
    deliveryInstructions: row.deliveryInstructions,
    excessReason: row.excessReason,
    items,
  };
}

/**
 * A single center-owned lista (any non-draft status), scoped by center_id so
 * one center can never read another's. Center-private + uncached (same
 * contract as §4.4) so the just-published confirm screen reflects the write
 * immediately. Returns null when not found / not owned.
 */
export async function getCenterListaById(
  centerId: string,
  listaId: string,
): Promise<CenterListaDetailData | null> {
  const [r] = await db
    .select({
      id: lista.id,
      shortId: lista.shortId,
      status: lista.status,
      city: lista.city,
      categories: lista.categories,
      publishedAt: lista.publishedAt,
      shareCount: lista.shareCount,
      closedReason: lista.closedReason,
      createdAt: lista.createdAt,
      deliveryInstructions: lista.deliveryInstructions,
      addressLine: center.addressLine,
      addressReference: center.addressReference,
      regularScheduleText: center.regularScheduleText,
    })
    .from(lista)
    .innerJoin(center, eq(center.id, lista.centerId))
    .where(and(eq(lista.id, listaId), eq(lista.centerId, centerId)))
    .limit(1);

  if (!r) return null;

  const items = await db
    .select({
      id: listaItem.id,
      name: sql<string>`coalesce(${supply.name}, ${listaItem.customName})`,
      category: listaItem.category,
    })
    .from(listaItem)
    .leftJoin(supply, eq(supply.id, listaItem.supplyId))
    .where(eq(listaItem.listaId, listaId))
    .orderBy(asc(listaItem.createdAt));

  const { addressLine, addressReference, regularScheduleText, ...rest } = r;
  return {
    ...rest,
    items,
    center: { addressLine, addressReference, regularScheduleText },
  };
}

/**
 * Catalog supplies for one area/category, for the insumo selector. Center-facing
 * + uncached (carries none of the donor surge tags), mirroring §4.4. Returns
 * id+name pairs, name-sorted, active only.
 */
export async function getSuppliesByCategory(
  category: string,
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: supply.id, name: supply.name })
    .from(supply)
    .where(
      and(
        eq(supply.category, category as typeof supply.category.enumValues[number]),
        eq(supply.isActive, true),
      ),
    )
    .orderBy(asc(supply.name));
}

/**
 * The full active catalog (id+name), name-sorted, for the insumo selector. The
 * "área" facet was dropped from authoring, so the selector now searches one flat
 * list and lets the center add any typed string as a custom insumo. Center-facing
 * + uncached (no donor surge tags).
 */
export async function getActiveSupplies(): Promise<
  { id: string; name: string }[]
> {
  return db
    .select({ id: supply.id, name: supply.name })
    .from(supply)
    .where(eq(supply.isActive, true))
    .orderBy(asc(supply.name));
}

// ---- 4.5 center profile (PRIVATE, uncached) --------------------------------
//
// Same center-private contract as §4.4: scoped by the logged-in center's id
// (resolved server-side via requireCenter — never a client id), NOT cached, and
// carrying none of the donor surge tags so the profile reflects the center's own
// writes (the reception toggle) immediately on redirect.

/** The center profile screen's read model (Figma 57:1886 / 57:2009). */
export type CenterProfileData = {
  name: string;
  type: string | null; // NULLABLE — gate display behind CENTER_TYPE_ENABLED
  city: string;
  state: string | null;
  addressLine: string | null;
  addressReference: string | null;
  regularScheduleText: string | null;
  whatsappPhone: string | null;
  verifiedAt: Date | null;
  receptionPausedAt: Date | null;
  responsibleName: string | null;
  cargo: string | null;
  /** lifetime stats (decision §5.3 — Activas + Cumplidas only, no Donantes). */
  activas: number;
  /** closed AND closedReason = 'fulfilled' (reception-pause closes are
   * 'cancelled' and deliberately excluded so pausing never inflates this). */
  cumplidas: number;
};

/**
 * Center info + responsable + lifetime stats for the profile screen. One
 * center+app_user join (mirrors the editar page select) plus a single FILTER
 * aggregate for Activas/Cumplidas. `userId` selects the responsable row;
 * `centerId` scopes everything (Drizzle bypasses RLS). Returns null when the
 * center row is missing (defensive — requireCenter guarantees it exists).
 */
export async function getCenterProfile(
  centerId: string,
  userId: string,
): Promise<CenterProfileData | null> {
  const [row] = await db
    .select({
      name: center.name,
      type: center.type,
      city: center.city,
      state: center.state,
      addressLine: center.addressLine,
      addressReference: center.addressReference,
      regularScheduleText: center.regularScheduleText,
      whatsappPhone: center.whatsappPhone,
      verifiedAt: center.verifiedAt,
      receptionPausedAt: center.receptionPausedAt,
      responsibleName: appUser.name,
      cargo: appUser.cargo,
    })
    .from(center)
    .leftJoin(appUser, eq(appUser.id, userId))
    .where(eq(center.id, centerId))
    .limit(1);

  if (!row) return null;

  const [stats] = await db
    .select({
      activas: sql<number>`count(*) filter (where ${lista.status} = 'active')::int`,
      cumplidas: sql<number>`count(*) filter (where ${lista.status} = 'closed' and ${lista.closedReason} = 'fulfilled')::int`,
    })
    .from(lista)
    .where(eq(lista.centerId, centerId));

  return {
    ...row,
    activas: stats?.activas ?? 0,
    cumplidas: stats?.cumplidas ?? 0,
  };
}

/**
 * The center's currently-active lista (id only — title/expiry gone in the
 * lista model), for the "Desactivar recepción" sheet, which lists what will
 * close. Center-private + uncached.
 */
export async function getCenterActiveListas(
  centerId: string,
): Promise<{ id: string }[]> {
  return db
    .select({ id: lista.id })
    .from(lista)
    .where(and(eq(lista.centerId, centerId), eq(lista.status, "active")));
}

/**
 * The center's listas that were CLOSED by a reception pause — `closed` with
 * `closedReason = 'cancelled'` since the pause timestamp — newest-closed first.
 * Powers the "Listas cerradas al pausar" list on the Pausado profile.
 * Scoping to `closedReason = 'cancelled'` AND `closedAt >= since` keeps finalized
 * (fulfilled) listas out of the list. Center-private + uncached.
 */
export async function getCenterListasClosedSince(
  centerId: string,
  since: Date,
): Promise<CenterListaCardData[]> {
  const rows = await db
    .select({
      id: lista.id,
      shortId: lista.shortId,
      status: lista.status,
      city: lista.city,
      categories: lista.categories,
      publishedAt: lista.publishedAt,
      shareCount: lista.shareCount,
      closedReason: lista.closedReason,
      createdAt: lista.createdAt,
    })
    .from(lista)
    .where(
      and(
        eq(lista.centerId, centerId),
        eq(lista.status, "closed"),
        eq(lista.closedReason, "cancelled"),
        gte(lista.closedAt, since),
      ),
    )
    .orderBy(desc(lista.closedAt));

  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({
          id: listaItem.id,
          listaId: listaItem.listaId,
          name: sql<string>`coalesce(${supply.name}, ${listaItem.customName})`,
          category: listaItem.category,
        })
        .from(listaItem)
        .leftJoin(supply, eq(supply.id, listaItem.supplyId))
        .where(inArray(listaItem.listaId, ids))
        .orderBy(asc(listaItem.createdAt))
    : [];

  const itemsByLista = new Map<string, ListaItemData[]>();
  for (const it of items) {
    const list = itemsByLista.get(it.listaId) ?? [];
    list.push({ id: it.id, name: it.name, category: it.category });
    itemsByLista.set(it.listaId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    shortId: r.shortId,
    status: r.status,
    city: r.city,
    categories: r.categories,
    publishedAt: r.publishedAt,
    shareCount: r.shareCount,
    closedReason: r.closedReason,
    createdAt: r.createdAt,
    items: itemsByLista.get(r.id) ?? [],
  }));
}
