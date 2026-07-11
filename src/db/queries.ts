import "server-only";

import {
  and,
  arrayOverlaps,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { CATEGORY_GROUPS, categoryValueFromLabel } from "@/lib/format";

import { db } from "./index";
import {
  appUser,
  center,
  invitation,
  lista,
  listaItem,
  membership,
  supply,
} from "./schema";

// ---- shared helpers ---------------------------------------------------------

/** Canonical UUID shape — guards id params before they hit a Postgres uuid cast
 * (a malformed id would otherwise throw 22P02 → 500 instead of a clean 404). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Escape LIKE/ILIKE metacharacters (\ % _) so a user-supplied search term is
 * matched literally and can't inject wildcard patterns. Postgres LIKE defaults
 * to `\` as the escape char, so no explicit ESCAPE clause is needed. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ---- shared types ----------------------------------------------------------

export type ListaSort = "recent"; // Reciente

export type ListaFilters = {
  search?: string; // matches center name, city, or item name
  city?: string; // lista.city
  type?: string; // center.type enum value
  category?: string; // a donor-facing CATEGORY_GROUPS key (e.g. "medical", "food")
  sort?: ListaSort; // default "recent"
};

export type ListaItemData = {
  id: string;
  name: string; // supply.name ?? custom_name
  category: string; // lista_item.category (already Spanish)
  bucket: "need" | "excess";
  isUrgent: boolean;
  quantity: number | null; // optional "× N" (need bucket only); null = unset
};

/** Fields shared by the donor card and detail shapes (lista-model-v2 §6). */
type ListaBase = {
  id: string;
  city: string | null;
  centerName: string;
  centerDescription: string | null;
  centerType: string | null;
  publishedAt: Date | null;
  updatedAt: Date; // freshness line + fresh-first/stale-sink sort key
  categories: string[] | null;
};

/**
 * Donor card shape: items pre-derived into the three sections (Urgente /
 * Necesitamos / No aceptamos) so RequestCard stays dumb.
 */
export type ListaCardData = ListaBase & {
  urgentItems: ListaItemData[]; // bucket=need & isUrgent
  needItems: ListaItemData[]; // bucket=need & !isUrgent
  excessItems: ListaItemData[]; // bucket=excess
  hasUrgent: boolean; // urgentItems.length > 0
};

export type ListaDetailData = ListaBase & {
  status: "active" | "paused" | "closed" | "draft";
  deliveryInstructions: string | null; // per-lista drop-off note
  excessReason: string | null; // "No aceptamos" caption
  // reception contact (field-insight §3) — who to look for on arrival. The phone
  // is published to the anonymous donor surface (opt-in in the editor).
  receptionContactName: string | null;
  receptionContactPhone: string | null; // E.164
  receptionLandmark: string | null;
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
    verifiedAt: Date | null; // powers the "Verificado" tag
    receptionPausedAt: Date | null; // null = "Recibiendo donaciones"
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
  // Match the term literally — escape LIKE metacharacters so a caller can't
  // inject wildcard patterns (defense-in-depth; length capping is at the boundary).
  const searchPattern = search ? `%${escapeLike(search)}%` : undefined;

  const rows = await db
    .select({
      id: lista.id,
      centerId: lista.centerId,
      city: lista.city,
      categories: lista.categories,
      publishedAt: lista.publishedAt,
      updatedAt: lista.updatedAt,
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
          ? // `filters.category` is a donor-facing GROUP key ("medical" spans
            // six enum values) — match listas whose categories[] overlaps the
            // group's members. Unknown keys fall back to a literal match.
            arrayOverlaps(
              lista.categories,
              CATEGORY_GROUPS[filters.category]?.values ?? [filters.category],
            )
          : undefined,
        searchPattern
          ? or(
              ilike(center.name, searchPattern),
              ilike(lista.city, searchPattern),
              sql`EXISTS (
                SELECT 1 FROM ${listaItem} li
                LEFT JOIN ${supply} s ON s.id = li.supply_id
                WHERE li.lista_id = ${lista.id}
                  AND (s.name ILIKE ${searchPattern}
                       OR li.custom_name ILIKE ${searchPattern})
              )`,
            )
          : undefined,
      ),
    )
    // Reciente: fresh-first, but sink listas untouched > 7 days to the bottom
    // (§4.2 D5). SQL-side so `now()` is evaluated at query time, not frozen by
    // unstable_cache's cached closure.
    .orderBy(
      sql`(${lista.updatedAt} < now() - interval '7 days')`,
      desc(lista.updatedAt),
    );

  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({
          id: listaItem.id,
          listaId: listaItem.listaId,
          name: sql<string>`coalesce(${supply.name}, ${listaItem.customName})`,
          category: listaItem.category,
          bucket: listaItem.bucket,
          isUrgent: listaItem.isUrgent,
          quantity: listaItem.quantity,
        })
        .from(listaItem)
        .leftJoin(supply, eq(supply.id, listaItem.supplyId))
        .where(inArray(listaItem.listaId, ids))
        .orderBy(asc(listaItem.createdAt))
    : [];

  const itemsByLista = new Map<string, ListaItemData[]>();
  for (const it of items) {
    const list = itemsByLista.get(it.listaId) ?? [];
    list.push({
      id: it.id,
      name: it.name,
      category: it.category,
      bucket: it.bucket,
      isUrgent: it.isUrgent,
      quantity: it.quantity,
    });
    itemsByLista.set(it.listaId, list);
  }

  return rows.map((r) => {
    const all = itemsByLista.get(r.id) ?? [];
    const urgentItems = all.filter((it) => it.bucket === "need" && it.isUrgent);
    const needItems = all.filter((it) => it.bucket === "need" && !it.isUrgent);
    const excessItems = all.filter((it) => it.bucket === "excess");
    return {
      id: r.id,
      city: r.city,
      centerName: r.centerName,
      centerDescription: r.centerDescription,
      centerType: r.centerType,
      publishedAt: r.publishedAt,
      updatedAt: r.updatedAt,
      categories: r.categories,
      urgentItems,
      needItems,
      excessItems,
      hasUrgent: urgentItems.length > 0,
    };
  });
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

// ---- 4.1b getActiveListaCategories -----------------------------------------

/**
 * Distinct supply categories (English enum values) present across the active
 * donor feed — mirrors how `cities` is derived from `lista.city`, but reads the
 * denormalized `lista.categories[]` array (unnested). Powers the donor category
 * chip row so a chip only appears when ≥1 active lista carries that category.
 * Cached under the same "active-listas" tag so it invalidates on publish/edit.
 */
async function queryActiveListaCategories(): Promise<string[]> {
  const rows = (await db.execute(sql`
    SELECT DISTINCT unnest(${lista.categories}) AS category
    FROM ${lista}
    INNER JOIN ${center} ON ${center.id} = ${lista.centerId}
    WHERE ${lista.status} = 'active' AND ${center.status} = 'approved'
  `)) as unknown as { category: string | null }[];
  return rows
    .map((r) => r.category)
    .filter((c): c is string => Boolean(c));
}

export function getActiveListaCategories(): Promise<string[]> {
  return unstable_cache(
    queryActiveListaCategories,
    ["active-lista-categories"],
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
      excessReason: lista.excessReason,
      receptionContactName: lista.receptionContactName,
      receptionContactPhone: lista.receptionContactPhone,
      receptionLandmark: lista.receptionLandmark,
      categories: lista.categories,
      publishedAt: lista.publishedAt,
      updatedAt: lista.updatedAt,
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
      verifiedAt: center.verifiedAt,
      receptionPausedAt: center.receptionPausedAt,
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
      bucket: listaItem.bucket,
      isUrgent: listaItem.isUrgent,
      quantity: listaItem.quantity,
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
    excessReason: r.excessReason,
    receptionContactName: r.receptionContactName,
    receptionContactPhone: r.receptionContactPhone,
    receptionLandmark: r.receptionLandmark,
    status: r.status,
    centerName: r.centerName,
    centerDescription: r.centerDescription,
    centerType: r.centerType,
    publishedAt: r.publishedAt,
    updatedAt: r.updatedAt,
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
      verifiedAt: r.verifiedAt,
      receptionPausedAt: r.receptionPausedAt,
    },
    items,
  };
}

/**
 * Single lista for the detail page. Returns null for draft/paused/not-found
 * so the page can call notFound(). Cached; tags "active-listas" and "lista:<id>".
 */
export function getListaById(id: string): Promise<ListaDetailData | null> {
  // Malformed (non-UUID) id → clean 404 (page notFound()s on null) instead of a
  // Postgres uuid-cast error bubbling up as a 500.
  if (!UUID_RE.test(id)) return Promise.resolve(null);
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
  quantity: number | null;
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
      quantity: listaItem.quantity,
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
  /** For customs only: the picked home category (enum value), reverse-mapped
   * from the stored Spanish label so an edit round-trips it. */
  category?: string;
  quantity: number | null;
};

export type CenterEditableLista = {
  id: string;
  deliveryInstructions: string | null;
  excessReason: string | null;
  receptionContactName: string | null;
  receptionContactPhone: string | null; // E.164
  receptionLandmark: string | null;
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
      receptionContactName: lista.receptionContactName,
      receptionContactPhone: lista.receptionContactPhone,
      receptionLandmark: lista.receptionLandmark,
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
      category: listaItem.category,
      bucket: listaItem.bucket,
      isUrgent: listaItem.isUrgent,
      quantity: listaItem.quantity,
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
    // Customs carry their picked category (reverse-mapped from the label);
    // catalog items re-derive it from the supply at publish, so leave undefined.
    category: r.supplyId ? undefined : categoryValueFromLabel(r.category),
    quantity: r.quantity,
  }));

  return {
    id: row.id,
    deliveryInstructions: row.deliveryInstructions,
    excessReason: row.excessReason,
    receptionContactName: row.receptionContactName,
    receptionContactPhone: row.receptionContactPhone,
    receptionLandmark: row.receptionLandmark,
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
      bucket: listaItem.bucket,
      isUrgent: listaItem.isUrgent,
      quantity: listaItem.quantity,
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
 * The full active catalog (id+name+category), for the insumo selector. The
 * selector searches one flat list; when NOT searching it renders the catalog
 * grouped under category headers (field-insight §2 — at 91 mixed items a flat
 * alphabetical list is unbrowsable), so each row carries its category. Sorted
 * name-ASC; the selector re-orders by CATEGORY display order. Center-facing +
 * uncached (no donor surge tags).
 */
export async function getActiveSupplies(): Promise<
  { id: string; name: string; category: string }[]
> {
  return db
    .select({ id: supply.id, name: supply.name, category: supply.category })
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
  responsibleEmail: string | null;
  cargo: string | null;
};

/**
 * Center info + responsable for the profile screen. The responsable identity
 * (name/cargo/email) is resolved from the center's `center_admin` membership
 * row — NOT the current viewer — so it's correct regardless of who opens the
 * screen (an Operador must still see the true Responsable). `centerId` scopes
 * everything (Drizzle bypasses RLS). Returns null when the center row is
 * missing (defensive — requireCenter guarantees it).
 */
export async function getCenterProfile(
  centerId: string,
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
      responsibleEmail: appUser.email,
      cargo: appUser.cargo,
    })
    .from(center)
    .leftJoin(
      membership,
      and(
        eq(membership.centerId, center.id),
        eq(membership.role, "center_admin"),
      ),
    )
    .leftJoin(appUser, eq(appUser.id, membership.userId))
    .where(eq(center.id, centerId))
    .limit(1);

  return row ?? null;
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
          bucket: listaItem.bucket,
          isUrgent: listaItem.isUrgent,
          quantity: listaItem.quantity,
        })
        .from(listaItem)
        .leftJoin(supply, eq(supply.id, listaItem.supplyId))
        .where(inArray(listaItem.listaId, ids))
        .orderBy(asc(listaItem.createdAt))
    : [];

  const itemsByLista = new Map<string, ListaItemData[]>();
  for (const it of items) {
    const list = itemsByLista.get(it.listaId) ?? [];
    list.push({
      id: it.id,
      name: it.name,
      category: it.category,
      bucket: it.bucket,
      isUrgent: it.isUrgent,
      quantity: it.quantity,
    });
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

// ---- team (Equipo / invitations) -------------------------------------------
// All queries below are center-scoped by a server-resolved `centerId`
// (requireResponsable() / getInvitationForJoin's own hash lookup) — uncached,
// no donor surge tags, matching the center-private query contract used
// elsewhere in this file (getCenterProfile, getCenterActiveListas, …).

export type TeamMemberData = {
  userId: string;
  name: string | null;
  email: string | null;
  role: "center_admin" | "center_member";
  createdAt: Date;
};

/**
 * The center's team, Responsable first then by join order. Since v1 enforces
 * exactly one `center_admin` per center (the registrant), that admin is the
 * unambiguous "who added this member" for every `center_member` row — there is
 * no per-member `invited_by` column on `membership` (out of scope for v1).
 */
export async function getTeamMembers(centerId: string): Promise<TeamMemberData[]> {
  const rows = await db
    .select({
      userId: appUser.id,
      name: appUser.name,
      email: appUser.email,
      role: membership.role,
      createdAt: membership.createdAt,
    })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(eq(membership.centerId, centerId))
    .orderBy(
      sql`case when ${membership.role} = 'center_admin' then 0 else 1 end`,
      asc(membership.createdAt),
    );
  return rows;
}

/** Total members (including the Responsable) — powers "N de 5 miembros". */
export async function countCenterMembers(centerId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(membership)
    .where(eq(membership.centerId, centerId));
  return row?.n ?? 0;
}

export type PendingInvitationData = {
  id: string;
  label: string | null;
  createdAt: Date;
  expiresAt: Date;
};

/** Non-lapsed pending invitations, newest first. */
export async function getPendingInvitations(
  centerId: string,
): Promise<PendingInvitationData[]> {
  return db
    .select({
      id: invitation.id,
      label: invitation.label,
      createdAt: invitation.createdAt,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.centerId, centerId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, sql`now()`),
      ),
    )
    .orderBy(desc(invitation.createdAt));
}

export type InvitationForJoin = {
  invitationId: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: Date;
  role: "center_admin" | "center_member";
  label: string | null;
  centerId: string;
  centerName: string;
  centerStatus: "pending_review" | "approved" | "rejected" | "suspended";
  inviterName: string | null;
  memberCount: number;
};

/**
 * Resolve an invitation by its token HASH (never the raw token — see
 * src/lib/team/token.ts) for the join page. Returns null on no match; callers
 * still re-check status/expiry/center-status themselves so every failure path
 * funnels to the SAME generic "invalid invite" outcome (never reveal which
 * check failed).
 */
export async function getInvitationForJoin(
  tokenHash: string,
): Promise<InvitationForJoin | null> {
  const [row] = await db
    .select({
      invitationId: invitation.id,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      role: invitation.role,
      label: invitation.label,
      centerId: invitation.centerId,
      centerName: center.name,
      centerStatus: center.status,
      inviterName: appUser.name,
    })
    .from(invitation)
    .innerJoin(center, eq(center.id, invitation.centerId))
    .leftJoin(appUser, eq(appUser.id, invitation.invitedBy))
    .where(eq(invitation.tokenHash, tokenHash))
    .limit(1);

  if (!row) return null;

  const memberCount = await countCenterMembers(row.centerId);
  return { ...row, memberCount };
}
