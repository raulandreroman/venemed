import "server-only";
import { redirect } from "next/navigation";
import { getCurrentCenter, type CurrentCenter } from "./current-center";

/**
 * Defense-in-depth guard for authed center pages. Middleware already blocks
 * anon access; this also resolves the no-membership branch and returns the
 * resolved center for status-specific checks at the page level.
 */
export async function requireCenter(): Promise<CurrentCenter> {
  const r = await getCurrentCenter();
  if (r.kind === "anon") redirect("/centro/login");
  if (r.kind === "no-membership") redirect("/centro/registro");
  return r.center;
}
