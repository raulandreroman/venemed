import "server-only";
import { redirect } from "next/navigation";
import { requireCenter } from "./require-center";
import type { CurrentCenter } from "./current-center";

/**
 * Responsable-only guard (membership.role === "center_admin"). Composes
 * `requireCenter()` (anon → /centro/login, no-membership → /centro/registro),
 * then bounces an Operador (center_member) to the dashboard.
 *
 * Data access is Drizzle/postgres-js, which BYPASSES RLS — this server-code
 * check is the ONLY authorization boundary for Responsable-only reads/writes
 * (center profile, reception toggle, team management). Every action/page that
 * must be Responsable-only calls this instead of `requireCenter()`.
 */
export async function requireResponsable(): Promise<CurrentCenter> {
  const current = await requireCenter();
  if (current.role !== "center_admin") redirect("/centro");
  return current;
}
