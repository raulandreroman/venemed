import "server-only";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appUser } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

export type AdminUser = {
  userId: string; // = supabase auth uid = app_user.id; the moderation actor id
  phone: string | null;
  name: string | null;
};

/**
 * Authz primitive for the (admin) surface. Resolves session → app_user and
 * asserts is_platform_admin. Non-admins (including authed center users) are
 * redirected to "/". Anonymous users are redirected to the admin login.
 *
 * Data access is Drizzle (bypasses RLS), so this is the ONLY authorization
 * gate for moderation — never trust a client-supplied actor id. Uses
 * getUser() (JWT-verified), not getSession().
 */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");

  const rows = await db
    .select({
      id: appUser.id,
      phone: appUser.phone,
      name: appUser.name,
      isAdmin: appUser.isPlatformAdmin,
    })
    .from(appUser)
    .where(eq(appUser.id, user.id))
    .limit(1);

  const row = rows[0];
  // authed-but-not-admin → donor home (anon already bounced to /admin/login).
  if (!row || !row.isAdmin) redirect("/");
  return { userId: row.id, phone: row.phone, name: row.name };
}
