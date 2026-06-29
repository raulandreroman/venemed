import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

import { AdminLoginForm } from "./admin-login-form";

/**
 * A1 · Admin login RSC wrapper (Figma `53:1361`). If already authed, bounce to
 * the queue (belt-and-suspenders with the middleware bounce off /admin/login).
 * The is_platform_admin authorization is enforced by requireAdmin() on /admin
 * itself — a non-admin who lands here logs in and is redirected to "/" there.
 */
export default async function AdminLoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/admin");

  return <AdminLoginForm channel="sms" />;
}
