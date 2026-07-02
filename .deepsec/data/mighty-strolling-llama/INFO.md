# mighty-strolling-llama (VeneMed)

## What this codebase does

VeneMed is an evergreen medical-aid platform for Venezuela (Next.js 16 App
Router, RSC-first, React 19, TypeScript, Tailwind v4, Supabase Postgres + Auth +
Storage, Drizzle ORM over `postgres-js`, hosted on Vercel). Each health center
maintains **one living `lista`** of needed supplies; items (`lista_item`) carry a
`bucket` (`need | excess`) + `is_urgent`, and the donor Urgente/Necesitamos/No-
aceptamos sections are read-time derivations. There is **no time window and no
expiry cron** — a lista goes *stale* by `now − updated_at`, sinks in the donor
ordering, and is nudged to reconfirm. **Donors browse anonymously, no auth** on
the `(public)` surface (`/`, `/listas`, `/listas/[id]`, one card per center).
Three surfaces: donor (public, cached), center back-office (`(center)`, authed,
with team roles), admin moderation (`(admin)`, authed). Copy is es-VE;
identifiers are English (`lista`=list, `center`=centro, `supply`=insumo).

> Model history: the repo pivoted from time-windowed *solicitudes* (`request`,
> 12/24/48h countdown, expiry cron) to this lista model. `request.kind`/`title`/
> `window_hours`/`expires_at`, `jobs.ts`, and `/api/cron/expire-requests` are
> GONE. Canonical spec: `docs/specs/lista-model-v2.md`.

## Auth shape

- **Authorization is enforced in server code, NOT via RLS.** Drizzle/postgres-js
  bypasses Postgres RLS entirely — Supabase Auth is only the identity/session
  layer. Every center-scoped query must derive `centerId` server-side.
- `getCurrentCenter()` (`src/lib/auth/current-center.ts`) — canonical primitive:
  session → `app_user` → `membership` → `center`; returns
  `anon | no-membership | center` with the member `role`. Uses
  `supabase.auth.getUser()` (JWT-verified), never `getSession()`.
- `requireCenter()` — page/action guard for any authed center user.
- `requireResponsable()` (`src/lib/auth/require-responsable.ts`) — asserts
  `membership.role === "center_admin"` (Responsable). The ONLY authz boundary
  for center profile, reception toggle, and **team management** — Operadores
  (`center_member`) are bounced.
- `requireAdmin()` — asserts `app_user.is_platform_admin`; the only moderation
  gate.
- `src/middleware.ts` gates `(center)`/`(admin)` on **session presence only**;
  real authz is per-page. Public paths: `/centro/login`, `/centro/registro`,
  `/admin/login`.
- Identity = verified session email, lowercased (`normalizeEmail()`); email OTP
  (migration 0008 dropped phone). `center.whatsapp_phone` is optional +
  **unverified**.

## Threat model

Hostile-state threat model under a donor surge. Highest impact: (1) mutating
another center's lista/items by passing a foreign id — every center action must
scope by `centerId` from `requireCenter()`/`requireResponsable()`, never trust
client ids; (2) **privilege escalation via team invitations** — a member cap
bypass, a `role` chosen by the invitee instead of the invite, or a token leak
(see below); (3) bypassing the `center.status` moderation gate; (4) forging
admin moderation actions; (5) leaking operator PII (email/whatsapp).

## Project-specific patterns to flag

- Center/admin Drizzle queries whose `where` clause is missing the `centerId`
  (or `is_platform_admin`) scope predicate — RLS will NOT save it.
- Responsable-only surfaces (profile, reception toggle, `equipo.ts` create/
  revoke/removeMember) that call `requireCenter()` instead of
  `requireResponsable()`, or trust a client-supplied `role`/`userId`.
- **Invitation flow** (`actions/equipo.ts` + `src/lib/team/token.ts`): raw token
  lives ONLY in the URL, DB stores its **SHA-256 hash** and is looked up by hash
  (never the raw token in a WHERE clause). The **member-cap check must be the
  authoritative one inside `acceptInvitation`** (the pre-check is advisory);
  status transitions (`pending→accepted/revoked/expired`) and expiry must be
  race-safe. Flag any raw-token logging/persistence or a role taken from
  anywhere but the invitation row.
- The **one-active-lista-per-center** invariant (partial unique index); publish/
  edit paths must not create a second `active`/`paused` lista.
- `recordShare` (`app/actions/share.ts`) is public + unauthenticated by design —
  revalidates `lista:<id>` + `landing-stats` but deliberately NOT `active-listas`.
- `"use server"` files exporting a non-async value (breaks the action transform).

## Known false-positives

- The entire `(public)` surface is **intentionally unauthenticated** (donor
  landing/list/detail expose only published lista data).
- `acceptInvitation`/`rejectInvitation` intentionally require **no session** —
  possessing the raw token IS the authority; that is by design, not missing auth.
- `center.whatsapp_phone` being unverified is intentional (contact field).
- `db/seed.ts` is a destructive local-only fixture — intended, gated to local DB.
- Absence of RLS policies is the intended architecture — do NOT flag it.
- There is **no cron endpoint** anymore — don't expect `/api/cron/*` or a
  `CRON_SECRET` check; the expiry job was retired with the pivot.
- `lista_status` includes `paused`, currently **unused** (reception-off closes
  live listas) — not dead-code-vuln.
