import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appUser, membership, center } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export type CenterStatus =
  | "pending_review"
  | "approved"
  | "rejected"
  | "suspended";

export type CurrentCenter = {
  userId: string; // = supabase auth uid = app_user.id
  email: string | null;
  centerId: string;
  centerName: string;
  status: CenterStatus;
  rejectionReason: string | null;
  role: "center_admin" | "center_member";
};

// Returns:
//  { kind: "anon" }                    no session
//  { kind: "no-membership", userId }   session but no membership row
//  { kind: "center", center }          session + resolved center
export type CurrentCenterResult =
  | { kind: "anon" }
  | { kind: "no-membership"; userId: string; email: string | null }
  | { kind: "center"; center: CurrentCenter };

/**
 * Canonical authz primitive. Resolves session → app_user → membership → center
 * entirely server-side. All center-scoped Drizzle queries derive centerId from
 * here — never from client input. Uses getUser() (JWT-verified), not
 * getSession().
 */
export async function getCurrentCenter(): Promise<CurrentCenterResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { kind: "anon" };

  const rows = await db
    .select({
      userId: appUser.id,
      email: appUser.email,
      centerId: center.id,
      centerName: center.name,
      status: center.status,
      rejectionReason: center.rejectionReason,
      role: membership.role,
    })
    .from(appUser)
    .leftJoin(membership, eq(membership.userId, appUser.id))
    .leftJoin(center, eq(center.id, membership.centerId))
    .where(eq(appUser.id, user.id))
    .limit(1);

  const row = rows[0];
  if (!row || !row.centerId) {
    return { kind: "no-membership", userId: user.id, email: user.email ?? null };
  }
  return {
    kind: "center",
    center: {
      userId: row.userId,
      email: row.email,
      centerId: row.centerId,
      centerName: row.centerName!,
      status: row.status!,
      rejectionReason: row.rejectionReason,
      role: row.role!,
    },
  };
}
