import "server-only";

import {
  and,
  arrayContains,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "./index";
import {
  appUser,
  center,
  invitation,
  membership,
  request,
  requestItem,
  supply,
} from "./schema";

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
  centerId: string; // for attaching the center's aviso-de-exceso banner
  city: string | null;
  title: string | null; // center-written descriptor
  centerName: string;
  centerDescription: string | null;
  centerType: string | null;
  publishedAt: Date | null;
  expiresAt: Date | null;
  // null only for an aviso de exceso "Sin límite" (window_hours nullable as of
  // migration 0006). Donor needs always carry a 12/24/48 window.
  windowHours: number | null;
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
    type: string | null;
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
  // null for an aviso de exceso "Sin límite" (window_hours nullable as of 0006).
  windowHours: number | null;
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

// ---- 4.1 getActiveRequests -------------------------------------------------

async function queryActiveRequests(
  filters: RequestFilters,
): Promise<RequestCardData[]> {
  const search = filters.search?.trim();

  const rows = await db
    .select({
      id: request.id,
      kind: request.kind,
      centerId: request.centerId,
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
        // donor cards are needs only — an aviso de exceso (kind='surplus')
        // surfaces as a per-center banner, never as its own card.
        eq(request.kind, "need"),
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
    centerId: r.centerId,
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

// ---- 4.1b getActiveSurplusByCenter -----------------------------------------
//
// An aviso de exceso is a request(kind='surplus') + its request_item rows. It
// renders ONLY as a per-center banner (no donor card, no /solicitudes/<id>
// page — see getRequestById's kind='need' guard below). This returns each
// approved center's single ACTIVE surplus (one-active-per-center is enforced by
// the partial unique index), so the donor list/detail can attach the banner
// above that center's need cards. Shares the donor surge cache (tag
// "active-requests") so publishing/removing an aviso busts it in lockstep.

export type ActiveSurplus = {
  items: string[]; // insumo names the center is NOT accepting
  expiresAt: Date | null; // null = "Sin límite" (no auto-clear)
  reason: string | null; // request.title
};

async function queryActiveSurplusList(): Promise<
  (ActiveSurplus & { centerId: string })[]
> {
  const rows = await db
    .select({
      id: request.id,
      centerId: request.centerId,
      title: request.title,
      expiresAt: request.expiresAt,
    })
    .from(request)
    .innerJoin(center, eq(center.id, request.centerId))
    .where(
      and(
        eq(request.kind, "surplus"),
        eq(request.status, "active"),
        eq(center.status, "approved"),
      ),
    );

  const ids = rows.map((r) => r.id);
  const items = ids.length
    ? await db
        .select({
          requestId: requestItem.requestId,
          name: sql<string>`coalesce(${supply.name}, ${requestItem.customName})`,
        })
        .from(requestItem)
        .leftJoin(supply, eq(supply.id, requestItem.supplyId))
        .where(inArray(requestItem.requestId, ids))
        .orderBy(asc(requestItem.createdAt))
    : [];

  const namesByRequest = new Map<string, string[]>();
  for (const it of items) {
    const list = namesByRequest.get(it.requestId) ?? [];
    list.push(it.name);
    namesByRequest.set(it.requestId, list);
  }

  return rows.map((r) => ({
    centerId: r.centerId,
    items: namesByRequest.get(r.id) ?? [],
    expiresAt: r.expiresAt,
    reason: r.title,
  }));
}

/**
 * Active avisos de exceso keyed by centerId. Cached array (Maps don't survive
 * unstable_cache's serialization) revived into a Map at the call site; tag
 * "active-requests".
 */
export async function getActiveSurplusByCenter(): Promise<
  Map<string, ActiveSurplus>
> {
  const list = await unstable_cache(queryActiveSurplusList, ["active-surplus"], {
    revalidate: 60,
    tags: ["active-requests"],
  })();
  return new Map(
    list.map(({ centerId, ...rest }) => [centerId, rest]),
  );
}

// ---- 4.2 getRequestById ----------------------------------------------------

async function queryRequestById(
  id: string,
): Promise<RequestDetailData | null> {
  const [r] = await db
    .select({
      id: request.id,
      kind: request.kind,
      centerId: request.centerId,
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
        // banner-only: an aviso de exceso (kind='surplus') is never an
        // individually navigable donor page → null here → page notFound()s.
        eq(request.kind, "need"),
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
    centerId: r.centerId,
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
        // exclude avisos de exceso (kind='surplus') — they render as the
        // dashboard banner (getCenterActiveSurplus), never as a request card.
        ne(request.kind, "surplus"),
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
    .where(
      and(
        eq(request.id, requestId),
        eq(request.centerId, centerId),
        // an aviso de exceso never opens the generic request detail (it would
        // render a Countdown against a possibly-null window) — it's the banner.
        ne(request.kind, "surplus"),
      ),
    )
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
 * The logged-in center's single ACTIVE aviso de exceso (request kind='surplus',
 * status='active') — for the dashboard + each center request-detail banner, and
 * to pre-fill the edit form. Center-private + uncached (same §4.4 contract:
 * scoped by centerId, no donor surge tags) so the center sees its own
 * publish/edit/remove immediately. `items` carries supplyId so the form can
 * re-select catalog picks; `name` is the display label. Returns null when the
 * center has no active aviso.
 */
export type CenterActiveSurplus = {
  id: string;
  reason: string | null; // request.title
  expiresAt: Date | null; // null = "Sin límite"
  windowHours: number | null; // null = "Sin límite"
  items: { id: string; name: string; supplyId: string | null }[];
};

export async function getCenterActiveSurplus(
  centerId: string,
): Promise<CenterActiveSurplus | null> {
  const [r] = await db
    .select({
      id: request.id,
      title: request.title,
      expiresAt: request.expiresAt,
      windowHours: request.windowHours,
    })
    .from(request)
    .where(
      and(
        eq(request.centerId, centerId),
        eq(request.kind, "surplus"),
        eq(request.status, "active"),
      ),
    )
    .limit(1);

  if (!r) return null;

  const items = await db
    .select({
      id: requestItem.id,
      supplyId: requestItem.supplyId,
      name: sql<string>`coalesce(${supply.name}, ${requestItem.customName})`,
    })
    .from(requestItem)
    .leftJoin(supply, eq(supply.id, requestItem.supplyId))
    .where(eq(requestItem.requestId, r.id))
    .orderBy(asc(requestItem.createdAt));

  return {
    id: r.id,
    reason: r.title,
    expiresAt: r.expiresAt,
    windowHours: r.windowHours,
    items,
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
      activas: sql<number>`count(*) filter (where ${request.status} = 'active')::int`,
      cumplidas: sql<number>`count(*) filter (where ${request.status} = 'closed' and ${request.closedReason} = 'fulfilled')::int`,
    })
    .from(request)
    .where(eq(request.centerId, centerId));

  return {
    ...row,
    activas: stats?.activas ?? 0,
    cumplidas: stats?.cumplidas ?? 0,
  };
}

/**
 * The center's currently-active requests (id + title + expiry), soonest-expiring
 * first — for the "Desactivar recepción" sheet, which lists what will close.
 * Center-private + uncached.
 */
export async function getCenterActiveRequests(
  centerId: string,
): Promise<{ id: string; title: string | null; expiresAt: Date | null }[]> {
  return db
    .select({
      id: request.id,
      title: request.title,
      expiresAt: request.expiresAt,
    })
    .from(request)
    .where(and(eq(request.centerId, centerId), eq(request.status, "active")))
    .orderBy(asc(request.expiresAt));
}

/**
 * The center's requests that were CLOSED by a reception pause — `closed` with
 * `closedReason = 'cancelled'` since the pause timestamp — newest-closed first.
 * Powers the "Solicitudes cerradas al pausar" list on the Pausado profile.
 * Scoping to `closedReason = 'cancelled'` AND `closedAt >= since` keeps finalized
 * (fulfilled) or expired requests out of the list. Center-private + uncached.
 */
export async function getCenterRequestsClosedSince(
  centerId: string,
  since: Date,
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
        eq(request.status, "closed"),
        eq(request.closedReason, "cancelled"),
        gte(request.closedAt, since),
      ),
    )
    .orderBy(desc(request.closedAt));

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

// ---- team (Equipo / invitations) -------------------------------------------
// All queries below are center-scoped by a server-resolved `centerId`
// (requireResponsable() / getInvitationForJoin's own hash lookup) — uncached,
// no donor surge tags, matching the center-private query contract used
// elsewhere in this file (getCenterProfile, getCenterActiveRequests, …).

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
