import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appUser } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getCurrentCenter } from "./current-center";

/** Status → landing route. Exported so the registration flow (page-level and
 * server-action idempotency checks) routes existing-membership users the same
 * way login does. */
export const ROUTE_BY_STATUS = {
  approved: "/centro",
  pending_review: "/centro/en-revision",
  rejected: "/centro/rechazado",
  suspended: "/centro/rechazado", // suspended reuses the "needs attention" screen in v1
} as const;

/**
 * Called once right after a successful verifyOtp (from the finishLogin server
 * action). (1) upserts app_user with id = auth uid, (2) resolves
 * membership/center, (3) returns the path the client should navigate to.
 */
export async function resolveLoginDestination(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/centro/login"; // defensive; should not happen post-verify

  // (1) Upsert app_user with id = auth uid. Phone comes from the verified
  // session. Supabase stores phone WITHOUT the leading '+'; we persist WITH it
  // for consistency with center.whatsapp_phone.
  const phone = user.phone ? `+${user.phone}` : null;
  const now = new Date();
  await db
    .insert(appUser)
    .values({
      id: user.id,
      phone: phone ?? user.id, // phone is NOT NULL + unique; verified phone always present here
      phoneVerifiedAt: now,
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: appUser.id,
      set: {
        phone: phone ?? undefined,
        phoneVerifiedAt: now,
        lastLoginAt: now,
        updatedAt: now,
      },
    });

  // (2) Admins short-circuit BEFORE membership routing. The upsert above never
  //     touches is_platform_admin (onConflictDoUpdate.set omits it), so the
  //     manually-provisioned flag is preserved. Admins frequently have NO
  //     membership and must never be routed to /centro/registro.
  const [adminRow] = await db
    .select({ isAdmin: appUser.isPlatformAdmin })
    .from(appUser)
    .where(eq(appUser.id, user.id))
    .limit(1);
  if (adminRow?.isAdmin) return "/admin";

  // (3) Otherwise: existing center-membership routing (unchanged).
  const result = await getCurrentCenter();
  if (result.kind === "no-membership") return "/centro/registro";
  if (result.kind === "anon") return "/centro/login";
  return ROUTE_BY_STATUS[result.center.status] ?? "/centro/en-revision";
}
