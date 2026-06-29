import "server-only";

import {
  and,
  arrayContains,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "./index";
import { center, request, requestItem, supply } from "./schema";

// ---- shared types ----------------------------------------------------------

export type RequestSort = "recent" | "urgency"; // Reciente | Urgencia

export type RequestFilters = {
  search?: string; // matches center name, city, or item name
  city?: string; // request.city
  type?: string; // center.type enum value
  category?: string; // a value present in request.categories[]
  sort?: RequestSort; // default "recent"
};

export type RequestItemData = {
  id: string;
  name: string; // supply.name ?? custom_name
  category: string; // request_item.category (already Spanish)
};

export type RequestCardData = {
  id: string;
  kind: "need" | "surplus";
  city: string | null;
  title: string | null; // center-written descriptor
  centerName: string;
  centerDescription: string | null;
  centerType: string;
  publishedAt: Date | null;
  expiresAt: Date | null;
  windowHours: number;
  categories: string[] | null;
  items: RequestItemData[];
};

export type RequestDetailData = RequestCardData & {
  status: "active" | "paused" | "closed" | "expired" | "draft";
  deliveryInstructions: string | null; // per-request drop-off note
  closedAt: Date | null;
  closedReason: "fulfilled" | "cancelled" | "expired" | null;
  shareCount: number;
  center: {
    name: string;
    description: string | null;
    city: string;
    type: string;
    addressLine: string | null;
    addressReference: string | null;
    regularScheduleText: string | null;
  };
  items: (RequestItemData & { isFulfilled: boolean })[];
};

export type LandingStats = {
  activeRequests: number;
  approvedCenters: number;
  lastUpdated: Date | null;
};

export type CenterRequestStatus =
  | "active"
  | "paused"
  | "closed"
  | "expired"
  | "draft";

/** A center's own request, for the back-office dashboard card. */
export type CenterRequestCardData = {
  id: string;
  shortId: number; // human-friendly global display id → "#1044"
  kind: "need" | "surplus";
  status: CenterRequestStatus;
  city: string | null;
  title: string | null;
  categories: string[] | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  windowHours: number;
  shareCount: number;
  closedReason: "fulfilled" | "cancelled" | "expired" | null;
  createdAt: Date;
  items: RequestItemData[];
};

/**
 * A center-owned request enriched for the center DETAIL screen: the card data
 * plus the per-request drop-off note and the center's address/schedule (joined
 * from `center`, since requireCenter() doesn't carry them). Superset of
 * CenterRequestCardData, so the dashboard/publicada card consumers stay
 * compatible.
 */
export type CenterRequestDetailData = CenterRequestCardData & {
  deliveryInstructions: string | null;
  center: {
    addressLine: string | null;
    addressReference: string | null;
    regularScheduleText: string | null;
  };
};

export type CenterDashboardStats = {
  /** count of status = 'active' */
  activas: number;
  /** active AND expiring within the next EXPIRING_SOON_HOURS (and not yet past) */
  porVencer: number;
};

/**
 * "Por vencer" threshold: an active request counts as expiring soon when its
 * expiry is within the next 6 hours (and still in the future). Independent of
 * the card's UrgencyTag color buckets (12h/24h) — this is the product "soon".
 */
export const EXPIRING_SOON_HOURS = 6;

// ---- 4.1 getActiveRequests -------------------------------------------------

async function queryActiveRequests(
  filters: RequestFilters,
): Promise<RequestCardData[]> {
  const search = filters.search?.trim();

  const rows = await db
    .select({
      id: request.id,
      kind: request.kind,
      city: request.city,
      title: request.title,
      categories: request.categories,
      publishedAt: request.publishedAt,
      expiresAt: request.expiresAt,
      windowHours: request.windowHours,
      centerName: center.name,
      centerDescription: center.description,
      centerType: center.type,
    })
    .from(request)
    .innerJoin(center, eq(center.id, request.centerId))
    .where(
      and(
        eq(request.status, "active"),
        eq(center.status, "approved"),
        filters.city ? eq(request.city, filters.city) : undefined,
        filters.type
          ? eq(center.type, filters.type as typeof center.type.enumValues[number])
          : undefined,
        filters.category
          ? arrayContains(request.categories, [filters.category])
          : undefined,
        search
          ? or(
              ilike(center.name, `%${search}%`),
              ilike(request.city, `%${search}%`),
              sql`EXISTS (
                SELECT 1 FROM ${requestItem} ri
                LEFT JOIN ${supply} s ON s.id = ri.supply_id
                WHERE ri.request_id = ${request.id}
                  AND (s.name ILIKE ${"%" + search + "%"}
                       OR ri.custom_name ILIKE ${"%" + search + "%"})
              )`,
            )
          : undefined,
      ),
    )
    .orderBy(
      filters.sort === "urgency"
        ? asc(request.expiresAt) // Urgencia: soonest expiry first
        : desc(request.publishedAt), // Reciente: newest first (default)
    );

  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({
          id: requestItem.id,
          requestId: requestItem.requestId,
          name: sql<string>`coalesce(${supply.name}, ${requestItem.customName})`,
          category: requestItem.category,
        })
        .from(requestItem)
        .leftJoin(supply, eq(supply.id, requestItem.supplyId))
        .where(inArray(requestItem.requestId, ids))
        .orderBy(asc(requestItem.createdAt))
    : [];

  const itemsByRequest = new Map<string, RequestItemData[]>();
  for (const it of items) {
    const list = itemsByRequest.get(it.requestId) ?? [];
    list.push({ id: it.id, name: it.name, category: it.category });
    itemsByRequest.set(it.requestId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    city: r.city,
    title: r.title,
    centerName: r.centerName,
    centerDescription: r.centerDescription,
    centerType: r.centerType,
    publishedAt: r.publishedAt,
    expiresAt: r.expiresAt,
    windowHours: r.windowHours,
    categories: r.categories,
    items: itemsByRequest.get(r.id) ?? [],
  }));
}

/**
 * Live donor feed: active requests from approved centers.
 * Cached via unstable_cache keyed on the normalized filters; tag "active-requests".
 */
export function getActiveRequests(
  filters: RequestFilters = {},
): Promise<RequestCardData[]> {
  const normalized: RequestFilters = {
    search: filters.search?.trim().toLowerCase() || undefined,
    city: filters.city || undefined,
    type: filters.type || undefined,
    category: filters.category || undefined,
    sort: filters.sort === "urgency" ? "urgency" : "recent",
  };
  const key = JSON.stringify(normalized);
  return unstable_cache(
    () => queryActiveRequests(normalized),
    ["active-requests", key],
    { revalidate: 60, tags: ["active-requests"] },
  )();
}

// ---- 4.2 getRequestById ----------------------------------------------------

async function queryRequestById(
  id: string,
): Promise<RequestDetailData | null> {
  const [r] = await db
    .select({
      id: request.id,
      kind: request.kind,
      status: request.status,
      city: request.city,
      title: request.title,
      deliveryInstructions: request.deliveryInstructions,
      categories: request.categories,
      publishedAt: request.publishedAt,
      expiresAt: request.expiresAt,
      windowHours: request.windowHours,
      closedAt: request.closedAt,
      closedReason: request.closedReason,
      shareCount: request.shareCount,
      centerName: center.name,
      centerDescription: center.description,
      centerCity: center.city,
      centerType: center.type,
      addressLine: center.addressLine,
      addressReference: center.addressReference,
      regularScheduleText: center.regularScheduleText,
    })
    .from(request)
    .innerJoin(center, eq(center.id, request.centerId))
    .where(
      and(
        eq(request.id, id),
        eq(center.status, "approved"),
        inArray(request.status, ["active", "closed", "expired"]),
      ),
    )
    .limit(1);

  if (!r) return null;

  const items = await db
    .select({
      id: requestItem.id,
      name: sql<string>`coalesce(${supply.name}, ${requestItem.customName})`,
      category: requestItem.category,
      isFulfilled: requestItem.isFulfilled,
    })
    .from(requestItem)
    .leftJoin(supply, eq(supply.id, requestItem.supplyId))
    .where(eq(requestItem.requestId, id))
    .orderBy(asc(requestItem.createdAt));

  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    city: r.city,
    title: r.title,
    deliveryInstructions: r.deliveryInstructions,
    centerName: r.centerName,
    centerDescription: r.centerDescription,
    centerType: r.centerType,
    publishedAt: r.publishedAt,
    expiresAt: r.expiresAt,
    windowHours: r.windowHours,
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
 * Single request for the detail page. Returns null for draft/paused/not-found
 * so the page can call notFound(). Cached; tags "active-requests" and "request:<id>".
 */
export function getRequestById(id: string): Promise<RequestDetailData | null> {
  return unstable_cache(() => queryRequestById(id), ["request", id], {
    revalidate: 60,
    tags: ["active-requests", `request:${id}`],
  })();
}

// ---- 4.3 getLandingStats ---------------------------------------------------

async function queryLandingStats(): Promise<LandingStats> {
  const [activeRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(request)
    .where(eq(request.status, "active"));

  const [centersRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(center)
    .where(eq(center.status, "approved"));

  const [lastRow] = await db
    .select({ last: sql<string | null>`max(${request.publishedAt})` })
    .from(request)
    .where(eq(request.status, "active"));

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
// (active-requests / landing-stats / request:<id>) so the dashboard reflects
// the center's own writes immediately.

/**
 * A center's own non-draft requests (active/paused/closed/expired), newest /
 * most-urgent first: active first, then soonest expiry, then most recent.
 */
export async function getCenterRequests(
  centerId: string,
): Promise<CenterRequestCardData[]> {
  const rows = await db
    .select({
      id: request.id,
      shortId: request.shortId,
      kind: request.kind,
      status: request.status,
      city: request.city,
      title: request.title,
      categories: request.categories,
      publishedAt: request.publishedAt,
      expiresAt: request.expiresAt,
      windowHours: request.windowHours,
      shareCount: request.shareCount,
      closedReason: request.closedReason,
      createdAt: request.createdAt,
    })
    .from(request)
    .where(
      and(
        eq(request.centerId, centerId),
        sql`${request.status} <> 'draft'`,
      ),
    )
    .orderBy(
      // active first
      asc(sql`case when ${request.status} = 'active' then 0 else 1 end`),
      asc(request.expiresAt), // soonest expiry (NULLs sort last under asc)
      desc(request.createdAt),
    );

  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({
          id: requestItem.id,
          requestId: requestItem.requestId,
          name: sql<string>`coalesce(${supply.name}, ${requestItem.customName})`,
          category: requestItem.category,
        })
        .from(requestItem)
        .leftJoin(supply, eq(supply.id, requestItem.supplyId))
        .where(inArray(requestItem.requestId, ids))
        .orderBy(asc(requestItem.createdAt))
    : [];

  const itemsByRequest = new Map<string, RequestItemData[]>();
  for (const it of items) {
    const list = itemsByRequest.get(it.requestId) ?? [];
    list.push({ id: it.id, name: it.name, category: it.category });
    itemsByRequest.set(it.requestId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    shortId: r.shortId,
    kind: r.kind,
    status: r.status,
    city: r.city,
    title: r.title,
    categories: r.categories,
    publishedAt: r.publishedAt,
    expiresAt: r.expiresAt,
    windowHours: r.windowHours,
    shareCount: r.shareCount,
    closedReason: r.closedReason,
    createdAt: r.createdAt,
    items: itemsByRequest.get(r.id) ?? [],
  }));
}

/**
 * A single center-owned request (any non-draft status), scoped by center_id so
 * one center can never read another's. Center-private + uncached (same contract
 * as getCenterRequests) so the just-published confirm screen reflects the write
 * immediately. Returns null when not found / not owned.
 */
export async function getCenterRequestById(
  centerId: string,
  requestId: string,
): Promise<CenterRequestDetailData | null> {
  const [r] = await db
    .select({
      id: request.id,
      shortId: request.shortId,
      kind: request.kind,
      status: request.status,
      city: request.city,
      title: request.title,
      categories: request.categories,
      publishedAt: request.publishedAt,
      expiresAt: request.expiresAt,
      windowHours: request.windowHours,
      shareCount: request.shareCount,
      closedReason: request.closedReason,
      createdAt: request.createdAt,
      deliveryInstructions: request.deliveryInstructions,
      addressLine: center.addressLine,
      addressReference: center.addressReference,
      regularScheduleText: center.regularScheduleText,
    })
    .from(request)
    .innerJoin(center, eq(center.id, request.centerId))
    .where(and(eq(request.id, requestId), eq(request.centerId, centerId)))
    .limit(1);

  if (!r) return null;

  const items = await db
    .select({
      id: requestItem.id,
      name: sql<string>`coalesce(${supply.name}, ${requestItem.customName})`,
      category: requestItem.category,
    })
    .from(requestItem)
    .leftJoin(supply, eq(supply.id, requestItem.supplyId))
    .where(eq(requestItem.requestId, requestId))
    .orderBy(asc(requestItem.createdAt));

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
 * Live stat tiles for the center dashboard. `now()`-based, so it stays accurate
 * between cron runs (the expiry cron only flips status; the <6h window count is
 * derived from expiresAt here, not from a flag).
 */
export async function getCenterDashboardStats(
  centerId: string,
): Promise<CenterDashboardStats> {
  const [row] = await db
    .select({
      activas: sql<number>`count(*) filter (where ${request.status} = 'active')::int`,
      porVencer: sql<number>`count(*) filter (where ${request.status} = 'active' and ${request.expiresAt} > now() and ${request.expiresAt} < now() + (${EXPIRING_SOON_HOURS} * interval '1 hour'))::int`,
    })
    .from(request)
    .where(eq(request.centerId, centerId));

  return { activas: row?.activas ?? 0, porVencer: row?.porVencer ?? 0 };
}
