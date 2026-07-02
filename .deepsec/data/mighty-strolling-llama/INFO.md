# mighty-strolling-llama (VeneMed)

## What this codebase does

VeneMed is a time-windowed medical-aid platform for Venezuela (Next.js 16 App
Router, RSC-first, React 19, TypeScript, Tailwind v4, Supabase Postgres + Auth +
Storage, Drizzle ORM over `postgres-js`, hosted on Vercel). Health centers
publish *solicitudes* (supply requests) with a 12/24/48h window; **donors browse
anonymously with NO auth** on the public surface (`(public)` → `/`,
`/solicitudes`, `/solicitudes/[id]`). Three surfaces: donor (public, cached),
center back-office (`(center)`, authed), admin moderation (`(admin)`, authed).
Copy is es-VE; identifiers are English (`request`=solicitud, `center`=centro,
`supply`=insumo).

## Auth shape

- **Authorization is enforced in server code, NOT via RLS.** Drizzle/postgres-js
  bypasses Postgres RLS entirely — Supabase Auth is only the identity/session
  layer. Every center-scoped query must derive `centerId` server-side.
- `getCurrentCenter()` (`src/lib/auth/current-center.ts`) — canonical primitive:
  resolves session → `app_user` → `membership` → `center`. Returns
  `anon | no-membership | center`. Uses `supabase.auth.getUser()` (JWT-verified),
  never `getSession()`.
- `requireCenter()` — page guard; redirects anon→login, no-membership→registro.
- `requireAdmin()` (`src/lib/auth/require-admin.ts`) — asserts
  `app_user.is_platform_admin`; the ONLY moderation authz gate.
- `src/middleware.ts` gates `(center)`/`(admin)` on **session presence only**
  (Drizzle unavailable in middleware); real authz is per-page. Public paths:
  `/centro/login`, `/centro/registro`, `/admin/login`.
- Identity = verified session email, lowercased (`normalizeEmail()`); OTP is
  email-based (migration 0008 dropped phone). `center.whatsapp_phone` is an
  optional, **unverified** contact field.

## Threat model

Runs under a hostile-state threat model with a donor traffic surge. Highest
impact: (1) an attacker mutating/expiring/closing another center's solicitudes
by supplying a foreign `requestId` — every center action must scope by
`centerId` from `requireCenter()`, never trust client ids; (2) bypassing the
`center.status` moderation gate (only `approved` centers may publish); (3)
forging admin moderation actions; (4) leaking operator PII (email/whatsapp) —
these identify real people in-country.

## Project-specific patterns to flag

- Any center/admin Drizzle query whose `where` clause is missing the
  `centerId` (or admin) scope predicate — RLS will NOT save it.
- Trusting a client-supplied `centerId`, `userId`, actor id, or `status`
  instead of deriving it from `getCurrentCenter()`/`requireAdmin()`.
- Center actions that mutate without first checking `current.status ===
  "approved"` (see `finalizeRequest` in `actions/gestionar.ts`).
- `"use server"` files exporting non-async values (breaks the action transform,
  gotcha #1) — a correctness footgun, not a vuln, but flag.
- Cron/API routes missing the constant-time `CRON_SECRET` bearer check
  (`api/cron/expire-requests/route.ts` is the reference; fail-closed on empty
  secret).
- `revalidateTag` called with donor-facing tags — confirm the mutation is
  authorized before it invalidates the cached public surge reads.

## Known false-positives

- The entire `(public)` surface is **intentionally unauthenticated** — donor
  landing/list/detail take no session and expose only published request data.
- `center.whatsapp_phone` being unverified is by design (contact field, not
  identity).
- `db/seed.ts` is a destructive local-only fixture (deletes/recreates data) —
  intended, gated to local DB.
- The `CRON_SECRET` endpoint is intended-public (network-reachable) but
  bearer-gated; the GitHub Actions schedule hits it every 5 min.
- Drizzle "bypasses RLS" is the intended architecture, not a misconfiguration —
  don't flag the absence of RLS policies.
