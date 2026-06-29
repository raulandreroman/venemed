import "server-only";

import { and, count, desc, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "./index";
import { appUser, center, membership, moderationEvent, request } from "./schema";
import type { CenterStatus } from "@/lib/auth/current-center";

// center_type enum value; mapped to a Spanish label in the UI layer.
export type CenterType =
  | "hospital"
  | "clinic"
  | "elder_care_home"
  | "childrens_shelter"
  | "collection_center";

export type CenterQueueRow = {
  id: string;
  name: string;
  type: CenterType;
  city: string;
  state: string | null;
  whatsappPhone: string;
  status: CenterStatus;
  rejectionReason: string | null;
  createdAt: Date; // "Solicitado hace X" (pending)
  verifiedAt: Date | null; // approved tab: "Aprobado hace X"
  updatedAt: Date; // rejected tab: "Rechazado hace X"
};

export type ModerationHistoryRow = {
  id: string;
  action: string; // 'approved' | 'rejected' | 'suspended' | 'expired_by_cron' | ...
  reason: string | null;
  createdAt: Date;
  actorName: string | null; // app_user.name of the acting admin (null for system/cron)
};

export type CenterReview = {
  id: string;
  name: string;
  type: CenterType;
  description: string | null;
  city: string;
  state: string | null;
  addressLine: string | null;
  addressReference: string | null;
  regularScheduleText: string | null;
  whatsappPhone: string;
  status: CenterStatus;
  rejectionReason: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  responsable: {
    name: string | null;
    phone: string | null;
    cargo: string | null;
  } | null;
  counts: { requestsTotal: number };
  history: ModerationHistoryRow[];
};

// ---- 3.1 listCentersByStatus ----------------------------------------------

async function queryCentersByStatus(
  status: CenterStatus,
): Promise<CenterQueueRow[]> {
  return db
    .select({
      id: center.id,
      name: center.name,
      type: center.type,
      city: center.city,
      state: center.state,
      whatsappPhone: center.whatsappPhone,
      status: center.status,
      rejectionReason: center.rejectionReason,
      createdAt: center.createdAt,
      verifiedAt: center.verifiedAt,
      updatedAt: center.updatedAt,
    })
    .from(center)
    .where(eq(center.status, status))
    .orderBy(desc(center.createdAt));
}

/**
 * Admin queue — ALL centers of a given status (never center_id-scoped),
 * newest-submitted first. Cached with a short revalidate so the queue feels
 * live; the moderation actions revalidate `admin-centers:<status>` on mutate.
 * Caller MUST already be authorized via requireAdmin().
 */
export async function listCentersByStatus(
  status: CenterStatus,
): Promise<CenterQueueRow[]> {
  const rows = await unstable_cache(
    () => queryCentersByStatus(status),
    ["admin-centers", status],
    { revalidate: 30, tags: ["admin-centers", `admin-centers:${status}`] },
  )();
  // unstable_cache JSON-serializes Dates → strings on read; re-hydrate so the
  // UI's date math (.getTime(), formatRelativeTime, isOlderThanHours) works.
  return rows.map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt),
    verifiedAt: r.verifiedAt ? new Date(r.verifiedAt) : null,
    updatedAt: new Date(r.updatedAt),
  }));
}

// ---- 3.3 listModerationHistory --------------------------------------------

/**
 * Audit trail for a center subject, newest first. Left-joins the acting
 * app_user for the actor name (null for system/cron events).
 */
export async function listModerationHistory(
  centerId: string,
): Promise<ModerationHistoryRow[]> {
  return db
    .select({
      id: moderationEvent.id,
      action: moderationEvent.action,
      reason: moderationEvent.reason,
      createdAt: moderationEvent.createdAt,
      actorName: appUser.name,
    })
    .from(moderationEvent)
    .leftJoin(appUser, eq(appUser.id, moderationEvent.actorUserId))
    .where(
      and(
        eq(moderationEvent.subjectType, "center"),
        eq(moderationEvent.subjectId, centerId),
      ),
    )
    .orderBy(desc(moderationEvent.createdAt));
}

// ---- 3.2 getCenterForReview -----------------------------------------------

/**
 * Full center record + responsable (the center_admin member's name/phone) +
 * request count + moderation history. Not cached — review detail is low-traffic
 * and must reflect the latest decision immediately. Returns null for a missing
 * id (page renders notFound()). Caller MUST be authorized via requireAdmin().
 */
export async function getCenterForReview(
  id: string,
): Promise<CenterReview | null> {
  const [row] = await db
    .select({
      id: center.id,
      name: center.name,
      type: center.type,
      description: center.description,
      city: center.city,
      state: center.state,
      addressLine: center.addressLine,
      addressReference: center.addressReference,
      regularScheduleText: center.regularScheduleText,
      whatsappPhone: center.whatsappPhone,
      status: center.status,
      rejectionReason: center.rejectionReason,
      verifiedAt: center.verifiedAt,
      createdAt: center.createdAt,
    })
    .from(center)
    .where(eq(center.id, id))
    .limit(1);

  if (!row) return null;

  // Responsable: the center_admin member's app_user (one user per center in v1,
  // queried defensively with limit(1)).
  const [resp] = await db
    .select({ name: appUser.name, phone: appUser.phone, cargo: appUser.cargo })
    .from(membership)
    .innerJoin(appUser, eq(appUser.id, membership.userId))
    .where(
      and(eq(membership.centerId, id), eq(membership.role, "center_admin")),
    )
    .limit(1);

  const [{ value: requestsTotal }] = await db
    .select({ value: count() })
    .from(request)
    .where(eq(request.centerId, id));

  const history = await listModerationHistory(id);

  return {
    ...row,
    responsable: resp ?? null,
    counts: { requestsTotal },
    history,
  };
}
