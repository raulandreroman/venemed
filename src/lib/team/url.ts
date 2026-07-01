import "server-only";
import { headers } from "next/headers";

/**
 * Resolve the base URL used to build a shareable invite link
 * (`${base}/centro/unirse/<token>`).
 *
 * Prefers `NEXT_PUBLIC_SITE_URL` (set on Vercel for prod/preview — see
 * .env.example) so the link is never derived from a client-controllable
 * request header. Only falls back to the request's `host`/`x-forwarded-*`
 * headers when that env var is unset (local dev), since trusting those
 * headers to build a shared link is a (low-risk, but avoidable) spoofing
 * surface in production.
 */
export async function getBaseUrl(): Promise<string> {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3140";
  return `${proto}://${host}`;
}
