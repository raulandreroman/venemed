import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { expireDueRequests } from "@/db/jobs";

// Cron endpoints must never be cached and need headroom for the batch write.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Constant-time bearer-token check. A plain `!==` short-circuits on the first
// mismatched byte, leaking the match length through timing; `timingSafeEqual`
// always reads both buffers fully. It throws on unequal lengths, so we guard on
// length first (the secret's length is fixed and non-secret here). Returns false
// (never throws) when the secret is unset/empty — fail closed.
function bearerMatches(authHeader: string | null, secret: string | undefined) {
  if (!secret) return false; // fail closed
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader ?? "");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

/**
 * Expiry cron endpoint (see docs/specs/cron-jobs.md §4).
 *
 * Vercel cron invokes this with `Authorization: Bearer $CRON_SECRET`. A public
 * trigger could mass-expire requests, so any request whose header does not match
 * the secret is rejected with 401 before any DB work.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  // Fail closed: a missing/empty secret must never collapse the comparison to
  // `Bearer undefined` and let an unauthenticated caller through.
  if (!bearerMatches(auth, process.env.CRON_SECRET)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { expired } = await expireDueRequests();
  return NextResponse.json({ ok: true, expired });
}
