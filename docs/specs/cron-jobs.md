# VeneMed — Cron & Scheduled Jobs (v1)

> **Status**: draft. Last updated 2026-06-28.
> Implementation spec for VeneMed's scheduled jobs. Expands the expiry-cron callout in `docs/specs/data-model.md` §5. Related to the request lifecycle.

## 1. Purpose & scope

VeneMed's core promise is that aid requests **stop circulating the moment their time window closes** — that's what prevents waste and center overload. A request's window is data (`expires_at`), but *something* has to flip the row to `expired` when the clock runs out. That's the job of the **expiry cron**.

This spec defines the scheduled jobs: what they do, how they're scheduled on Vercel, how the endpoints are secured, how they interact with the request lifecycle, and how we know when they fail. In scope for v1: the **expire-requests** job. Out of scope: center reminder nudges, data cleanup, analytics rollups (listed as future jobs in §10).

> **Why this matters more than a typical cron:** if this job silently stops, expired requests keep showing as active and donors keep being sent to closed centers — the exact failure VeneMed exists to prevent. So observability (§8) is a first-class requirement, not an afterthought.

## 2. Jobs overview

| Job | Schedule | Purpose |
|---|---|---|
| `expire-requests` | every 5 min (`*/5 * * * *`) | Flip `active`/`paused` requests whose `expires_at` has passed to `expired`; audit + revalidate caches |
| *health-check (optional)* | every 15 min | Alert if any request is past-due but still `active` (i.e. the expiry job failed) — see §8 |

Vercel Pro allows arbitrary cron frequency (Hobby is once/day) — we're on Pro, so 5-minute cadence is fine.

## 3. The `expire-requests` job

The single mutation, idempotent and concurrency-safe (the `WHERE` clause means a second concurrent run flips nothing extra):

```sql
UPDATE request
SET status = 'expired', closed_at = now(), closed_reason = 'expired'
WHERE status IN ('active', 'paused') AND expires_at < now()
RETURNING id, center_id;
```

- **`RETURNING`** gives us the flipped rows so we can (a) write audit events and (b) revalidate exactly the affected caches.
- **Audit:** bulk-insert one `moderation_event` per flipped row — `{ actor_user_id: null, subject_type: 'request', subject_id: id, action: 'expired_by_cron' }`.
- **Idempotent by construction:** re-running never double-processes; a row already `expired`/`closed` is excluded by the `WHERE`.
- **Batching:** at v1 volumes (dozens of centers) the set is tiny. If it ever grows, cap per run (`... LIMIT 500`) and let the next tick continue — but log when we hit the cap (no silent truncation).

**Both `kind` values are handled** — there's no `kind` filter, so `surplus` ("no enviar") notices expire on the same schedule as `need` requests. **`paused` is included** so a paused request's window keeps elapsing (pausing stops circulation, not the clock); `paused` is unused in the v1 UI but kept in the query for correctness/future.

## 4. Route handler & security

The job is an App Router route handler. **It must be unforgeable** — a public trigger could mass-expire requests.

- Vercel automatically sends `Authorization: Bearer $CRON_SECRET` to cron-invoked routes when `CRON_SECRET` is set. The handler **rejects any request without the matching secret** (401).
- Accept `GET` (Vercel cron uses GET). Return a small JSON summary (`{ expired: N }`) and proper status codes.
- Use the **direct (non-pooled) DB connection** for the batch write, or the pooled one with care; keep the work in one transaction.

```ts
// src/app/api/cron/expire-requests/route.ts
import { NextResponse } from "next/server";
import { expireDueRequests } from "@/db/jobs";

export const dynamic = "force-dynamic"; // never cached
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const { expired } = await expireDueRequests(); // runs the UPDATE + audit + revalidation
  return NextResponse.json({ ok: true, expired });
}
```

`CRON_SECRET` is a new env var — add to Vercel (all environments) and `.env.example`.

## 5. Vercel cron configuration

Declared in `vercel.ts` (preferred) — the schedule + path:

```ts
// vercel.ts
import { type VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [{ path: "/api/cron/expire-requests", schedule: "*/5 * * * *" }],
};
```

Cron jobs only run against the **production** deployment. For preview/local testing, trigger the endpoint manually with the secret (see §9).

## 6. Interaction with the request lifecycle

- **"Extender ventana" (extend window)** — the center action sets `expires_at` to a later time on an `active` request. The cron simply won't match it until the new time passes. No special-casing needed. Extending an already-`expired` request is **not** supported in v1 (`expired` is terminal — the center creates a new request instead). *(Confirm copy with design.)*
- **`closed` vs `expired`** — `closed` is a deliberate center action (`fulfilled`/`cancelled`); `expired` is the cron acting on a lapsed window. Both are terminal and both render via the donor "closed" detail view. The cron only ever produces `expired`.
- **Pause/resume** — not in v1 UI; if a request is ever `paused`, its window still elapses and the cron expires it on schedule.

## 7. Cache revalidation

Donor reads are cached for the surge (`revalidate = 60`), so an expired request would naturally drop off the list within ≤60 s. The cron should **revalidate immediately** for correctness so a donor never opens a just-expired request as active:

- After a successful run that flipped ≥1 row, call `revalidateTag("active-requests")`, `revalidateTag("landing-stats")`, and `revalidateTag(\`request:\${id}\`)` for each flipped id.
- This requires the donor data-access layer (`src/db/queries.ts`) to tag its cached reads with those tags — **dependency to wire up when integrating** (the donor slice currently uses time-based `revalidate`; add tags).
- The landing **"actualizado hace X"** stat reads from the same cached aggregate; revalidating `landing-stats` keeps it honest.

## 8. Observability & failure handling

A silently-dead expiry job is the worst-case failure, so:

- **Log every run** — count flipped, duration. Emit to Vercel logs + PostHog (`cron_expire_requests` event with `{ expired, ms }`).
- **Alert on error** — wrap the handler; on throw, capture to PostHog/Sentry and return 500 (Vercel surfaces failed cron runs in the dashboard).
- **Liveness / staleness check (recommended)** — a second cron (every 15 min) that counts requests where `status='active' AND expires_at < now() - interval '15 minutes'`. Any such row means the expiry job isn't running → **alert**. This catches a stuck/disabled cron that the happy-path logs wouldn't.
- **Dashboard** — a PostHog insight on `expired` per run to eyeball cadence.

## 9. Testing

- **Unit:** `expireDueRequests()` against a seeded row with `expires_at` in the past → asserts status flip + one `moderation_event` + correct return count.
- **Manual trigger:** `curl -H "Authorization: Bearer $CRON_SECRET" https://<deploy>/api/cron/expire-requests` to run on demand in preview/prod.
- **Auth:** request without/with-wrong secret → 401.
- **Idempotency:** run twice back-to-back → second run flips 0.

## 10. Edge cases & correctness

- **Timezones:** all timestamps are `timestamptz`; Postgres `now()` is tz-aware → comparisons are UTC-correct. No app-side clock involved in the flip.
- **Concurrent runs / overlap:** the `WHERE` clause makes overlapping invocations safe; no locking needed at this scale.
- **Clock skew:** the DB is the single clock (we use SQL `now()`, not JS `Date.now()`), so app/server skew is irrelevant.
- **Empty runs:** flipping 0 rows is normal and cheap; skip revalidation when 0.

## 11. Future jobs (out of v1 scope)

- **Pre-expiry nudge** — WhatsApp message to a center N hours before its window closes ("¿Extender o finalizar?").
- **Stat recompute** — if landing stats move off live aggregates to a materialized snapshot.
- **Retention cleanup** — archive/anonymize very old `closed`/`expired` requests.
