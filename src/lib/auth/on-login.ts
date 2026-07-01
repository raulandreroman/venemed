import "server-only";
import { and, eq, ne, notExists } from "drizzle-orm";
import { db } from "@/db";
import { appUser, membership } from "@/db/schema";
import { normalizeVePhone } from "@/lib/registro/validation";
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

  // (1) Upsert app_user with id = auth uid. The verified session phone is
  // normalized to the SAME canonical +58XXXXXXXXXX form the rest of the app uses
  // (registration, center.whatsapp_phone) — Supabase may store it with a trunk 0
  // (e.g. "5804241234567") if an OTP was ever sent un-normalized, so we must
  // canonicalize here too or app_user.phone diverges. See AGENTS.md gotcha #4.
  const phone =
    normalizeVePhone(user.phone) ?? (user.phone ? `+${user.phone}` : null);
  const now = new Date();

  await db.transaction(async (tx) => {
    // Reconcile a divergent/stale row: the canonical phone has a UNIQUE
    // constraint, so if it's currently held by a DIFFERENT app_user id (a legacy
    // row from before login canonicalized the trunk 0) the id-targeted upsert
    // below would hit `app_user_phone_unique` and 500. Drop that row FIRST — but
    // only when it has NO membership, so a real center is never affected. (After
    // the login-form normalization fix, this can only be pre-existing legacy
    // data; new logins never create a divergence.)
    if (phone) {
      await tx
        .delete(appUser)
        .where(
          and(
            eq(appUser.phone, phone),
            ne(appUser.id, user.id),
            notExists(
              tx
                .select({ id: membership.id })
                .from(membership)
                .where(eq(membership.userId, appUser.id)),
            ),
          ),
        );
    }

    await tx
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
