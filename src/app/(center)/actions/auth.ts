"use server";

import { redirect } from "next/navigation";
import { resolveLoginDestination } from "@/lib/auth/on-login";
import { createClient } from "@/lib/supabase/server";

/**
 * Called after a successful client-side verifyOtp. Upserts app_user, resolves
 * membership/center, and redirects server-side to the status destination so
 * the routing decision never lives in client code.
 */
export async function finishLogin() {
  const dest = await resolveLoginDestination();
  redirect(dest);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/centro/login");
}
