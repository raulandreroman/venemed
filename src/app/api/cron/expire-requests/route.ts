import { NextResponse } from "next/server";

import { expireDueRequests } from "@/db/jobs";

// Cron endpoints must never be cached and need headroom for the batch write.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { expired } = await expireDueRequests();
  return NextResponse.json({ ok: true, expired });
}
