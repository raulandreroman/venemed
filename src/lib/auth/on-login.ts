import "server-only";
import { and, eq, ne, notExists } from "drizzle-orm";
import type { User } from "@supabase/supabase-js";
import { db } from "@/db";
import { appUser, membership } from "@/db/schema";
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
 * Reconcile + upsert the `app_user` row for a freshly-verified Supabase auth
 * user (id = auth uid). Extracted from `resolveLoginDestination` so a
 * brand-new invitee (who has never gone through `finishLogin`) also gets an
 * `app_user` row before `acceptInvitation` binds a membership. Idempotent —
 * safe to call on every verified session.
 */
export async function upsertAppUserFromSession(user: User): Promise<void> {
  // Identity is the Supabase-verified email (lowercased for a stable unique
  // key). It's always present post-verify; the `?? undefined` guard is purely
  // defensive.
  const email = user.email?.trim().toLowerCase() || undefined;
  const now = new Date();

  await db.transaction(async (tx) => {
    // Reconcile a divergent/stale row: `email` is UNIQUE, so if it's currently
    // held by a DIFFERENT app_user id (a legacy row whose auth user was
    // deleted+recreated with a new uid) the id-targeted upsert below would hit
    // `app_user_email_unique` and 500. Drop that row FIRST — but only when it
    // has NO membership, so a real center is never affected.
    if (email) {
      await tx
        .delete(appUser)
        .where(
          and(
            eq(appUser.email, email),
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
        email,
        emailVerifiedAt: now,
        lastLoginAt: now,
      })
      .onConflictDoUpdate({
        target: appUser.id,
        set: {
          email,
          emailVerifiedAt: now,
          lastLoginAt: now,
          updatedAt: now,
        },
      });
  });
}

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

  // (1) Upsert app_user with id = auth uid.
  await upsertAppUserFromSession(user);

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
