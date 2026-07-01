<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# VeneMed — Agent Guide

Read this before working in the repo. It captures the product, architecture, conventions, and the hard-won gotchas so you can pick up development without relearning them.

## What VeneMed is

A **time-windowed medical-aid platform for Venezuela**. Health centers (hospitals, clinics, elderly homes, children's shelters, collection centers) publish *solicitudes* — requests for supplies (*insumos*) with a 12/24/48h window. Donors browse **anonymously, no login**, and share requests as links with a countdown so they **stop circulating** once the window closes or is paused — preventing wasted donations and center overload. Spanish (es-VE), mobile-first (390px). Built fast in response to an earthquake; reliability under a donor traffic surge matters.

**Three surfaces:**
- **Donor (public, no auth)** — landing, active-requests list, request detail (as a bottom-sheet). The surge lands here → it's CDN-cached.
- **Center (back office, auth)** — registration, WhatsApp/SMS OTP login, dashboard, create/manage solicitudes, edit center data.
- **Admin (moderation)** — vets centers (`pending_review → approved/rejected`). *Not built yet.*

## Stack

- **Next.js 16** (App Router, RSC-first) · React 19 · TypeScript · **Tailwind v4** · **pnpm**
- **Supabase** — Postgres (data) + Auth (identity/sessions) + Storage. Provisioned via the **Vercel Marketplace** (lives in a Vercel-managed Supabase org, billed through Vercel).
- **Drizzle ORM** (`postgres-js`) for all data access.
- **Auth**: Supabase Auth **email OTP** (6-digit code, `type: "email"`). Migrated off phone/Twilio OTP (migration 0008) — cheaper, more private under the hostile-state threat model (an operator can use a pseudonymous email instead of a carrier-traceable SIM), and no Meta/WhatsApp onboarding blocker. `center.whatsapp_phone` is kept as an **optional, unverified contact field** for delivery coordination.
- **Hosting**: Vercel (Fluid Compute). Prod: `https://venemedapp.org` (custom domain on Namecheap; `venemed.vercel.app` still resolves). Auth email (OTP) sends via **Resend** SMTP from `codigo@venemedapp.org` — configured in the prod Supabase dashboard (Auth → Emails → SMTP + the `{{ .Token }}` template), not in code.

## Commands

```bash
pnpm dev                 # local dev (port 3140 used in this project's notes)
pnpm build && pnpm start # production build / serve
pnpm lint                # eslint — CI GATE
npx tsc --noEmit         # typecheck — CI GATE
pnpm db:generate         # drizzle-kit: generate a migration from schema.ts
pnpm db:migrate          # apply migrations (uses POSTGRES_URL_NON_POOLING / DIRECT)
pnpm db:seed             # ⚠️ DESTRUCTIVE: deletes+recreates centers/requests/supplies (cascades memberships). Safe against LOCAL; NEVER against a shared/prod DB.
pnpm db:studio           # drizzle studio
pnpm test:e2e            # Playwright smoke (builds+serves on :3210, runs e2e/)

# Local Supabase lifecycle (see "Local development DB" below):
pnpm supabase:start      # boot local Supabase (Postgres + Auth + Storage) on Docker
pnpm supabase:stop       # tear down (data persists across start/stop)
pnpm supabase:status     # print local URLs + the deterministic local anon/service keys
pnpm db:setup            # drizzle migrate + seed against local .env.local
pnpm dev:local           # one-shot: supabase:start && db:setup && dev
```

Env comes from `.env.local` (gitignored). See `.env.example`. The Supabase env names are `POSTGRES_URL` (pooler, runtime, `prepare:false`), `POSTGRES_URL_NON_POOLING` (direct, migrations), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Plus `CRON_SECRET`, `TEST_CENTER_EMAIL`, `TEST_CENTER_EMAIL_2`, `TEST_ADMIN_EMAIL`, `TEST_OTP_CODE`. **Local dev + e2e default to a local Supabase** (below); `vercel env pull .env.local` restores the prod creds when you need them.

## Local development DB

`pnpm dev` and `pnpm test:e2e` run against a **fully-local Supabase stack** (Postgres + Auth + Storage) via the Supabase CLI on Docker — never the prod/cloud DB. We use Supabase Auth (`app_user.id` = `auth.users.id`), so a bare Postgres won't do; we need the full stack. See `docs/specs/local-dev-db.md`.

```bash
pnpm supabase:start   # blank Postgres + Auth + Storage on Docker (first start pulls images)
pnpm db:setup         # drizzle migrate + seed → local DB  (== db:migrate && db:seed)
pnpm dev              # serves against local (donor list shows seeded requests)
# … work …
pnpm supabase:stop    # tear down when done (data persists across start/stop)
```

- **Migrations stay Drizzle-owned.** We do **not** use Supabase's migration system — nothing goes in `supabase/migrations/`. `supabase start` boots a blank Postgres + Auth and we apply Drizzle (`db:migrate`) + `db:seed` on top. `supabase/config.toml` is the only committed Supabase file we hand-tune.
- **Deterministic local creds.** API `http://127.0.0.1:54321`, DB `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, Studio `http://127.0.0.1:54323`. The local anon/service keys printed by `pnpm supabase:status` are the well-known local demo keys — **public, not secrets** (safe to inline in CI / `.env.example`). No pooler locally → both POSTGRES URLs use the direct `:54322` port (`prepare:false` is a harmless no-op there).
- **Offline email OTP.** `supabase/config.toml` has an `[auth.email.test_otp]` map (`center@venemed.test`, `center2@venemed.test`, `admin@venemed.test` → `123456`) so center/admin login + registration work fully offline (no SMTP needed). The keys match the `TEST_CENTER_EMAIL` / `TEST_CENTER_EMAIL_2` / `TEST_ADMIN_EMAIL` env vars. Phone/SMS auth is disabled.
- **Env backup / recovery.** `.env.local` now holds LOCAL creds. The prior PROD creds were backed up to **`.env.vercel.local`** (gitignored). Restore prod locally with `cp .env.vercel.local .env.local`, or canonically `vercel env pull .env.local`. Prod env stays authoritative on Vercel and is never touched by local/CI runs. Never commit `.env*` (only `.env.example`).

## Repo layout

```
src/
  app/
    (public)/            # donor surface → "/", /solicitudes, /solicitudes/[id]
      solicitudes/[id]/  # detail; opens as an INTERCEPTED bottom-sheet (@modal) over the list, full-page on direct load
    (center)/            # back office (gated by middleware)
      centro/{login,registro,editar,en-revision,rechazado}/ + centro (dashboard placeholder)
      actions/           # "use server" actions (auth, registro, editar)
    (admin)/             # moderation (placeholder)
    api/cron/            # secured cron endpoints
  components/ui/         # design-system primitives (Button, RequestCard, Chip, Tag, AppBar, Countdown, …)
  db/                    # schema.ts, index.ts (db), queries.ts, seed.ts, jobs.ts (cron), migrations/
  lib/
    supabase/{server,client,middleware}.ts   # @supabase/ssr
    auth/                # getCurrentCenter, requireCenter, on-login (status routing)
    registro/validation.ts, geo/ve-states.ts, format.ts
  middleware.ts          # session refresh + gates (center) routes
e2e/                     # Playwright specs (donor.spec always-on; center.spec gated)
docs/specs/              # the canonical specs — READ THESE (data-model, cron-jobs, donor-*, center-*)
.github/workflows/       # ci.yml (lint+tsc), e2e.yml, expire-requests.yml (cron trigger)
```

## Architecture & key decisions

- **Data access is Drizzle/postgres-js, which bypasses RLS.** So **Supabase Auth is only the identity/session layer** — *authorization is enforced in server code by the logged-in center's `center_id`*, never RLS. Do not rely on RLS for app data.
- **Identity model**: `app_user.id` = the Supabase `auth.users` uid (1:1). `membership` links `app_user → center` (one per center in v1, enforced by a unique index). `center.status` is the moderation gate; login/registration route by it (`approved → /centro`, `pending_review → /centro/en-revision`, `rejected → /centro/rechazado`, no membership → `/centro/registro`). Helpers: `getCurrentCenter()`, `requireCenter()`, `resolveLoginDestination()`.
- **Request lifecycle**: `draft → active → paused → closed/expired` (terminal: closed/expired). `kind` ∈ `need | surplus` (surplus = "no enviar más de X", reuses the whole entity). Urgency = time-left (`expires_at asc`), no priority field. Delivery: center address inherited + optional per-request `delivery_instructions`. `request.title` is the center-written descriptor. `city` + `categories[]` are **denormalized onto `request`** at publish for the cached donor list.
- **Caching the surge**: donor reads are cached (`revalidate`/`unstable_cache` with tags `active-requests`, `landing-stats`, `request:<id>`). The cron + share actions `revalidateTag(tag, "max")` (Next 16 requires the 2-arg form).
- **Expiry cron**: `src/db/jobs.ts:expireDueRequests()` flips lapsed `active`/`paused` → `expired` (+ a `moderation_event`), exposed at `/api/cron/expire-requests` (Bearer `CRON_SECRET`, fail-closed). Vercel **Hobby** caps crons at once/day, so it's triggered by a **GitHub Actions schedule** (`.github/workflows/expire-requests.yml`, every 5 min) hitting the endpoint. On Vercel Pro, move to a native `vercel.json` cron.

## Conventions

- **Identifiers English, UI copy Spanish.** Table/column/enum names are English (`request` = *solicitud*, `supply` = *insumo*, `center` = *centro*); user-facing strings are es-VE.
- **Design system** (`src/components/ui` + `globals.css` tokens, from the Figma UI Kit): font **Inter**; type scale Display 28 / H1 22 / H2 18 / Body 16 / Label 14 / Caption 12. **Single-accent principle: the blue accent (`#1F5AA8`) is ONLY for actions** (buttons, links, active/selected, focus). Everything else is neutral; semantic colors (`success/warning/error` + tints) ONLY signal state. Exact tokens are in `globals.css` — use them, don't hardcode hex. Mobile-first 390px.
- **Match the surrounding code.** Server Components by default; `"use client"` only where interactivity needs it.

## Gotchas / hard-won lessons (read before writing center/action code)

1. **A `"use server"` file may export ONLY async functions.** No `export type`/const/non-function exports — the server-action transform references them at runtime → `X is not defined` when the action is invoked. Import types with `import type`.
2. **`build` + `curl GET` smoke does NOT exercise server actions or form submits** — that's how three action-invocation bugs shipped. Verify with the **Playwright e2e** (it submits forms / invokes actions), and when adding actions, drive the actual submit.
3. **Next 16 specifics**: `cookies()` is **async** (await it); keep `src/middleware.ts` (the deprecation warning is fine); `react-hooks/set-state-in-effect` is a **hard eslint error** (never call `setState` synchronously in a `useEffect` body — defer via `requestAnimationFrame`); `revalidateTag` needs the **two-arg** form `revalidateTag(tag, "max")`; redirects from middleware/actions must carry the refreshed auth cookies.
4. **Auth identity is the verified email** (migration 0008). `app_user.email` (unique) = the Supabase-verified session email, lowercased — set by `resolveLoginDestination()` / the registro action from `user.email`, never client input. `app_user.phone` was DROPPED (also a privacy win — removed the top-risk operator PII). `center.whatsapp_phone` is now an OPTIONAL, editable, unverified contact field (`normalizeVePhone()` still validates/normalizes it, but it is no longer tied to the session). Use `normalizeEmail()` for the login/identity email.
5. **Secure-context APIs**: `navigator.share` / `navigator.clipboard` only work on HTTPS or `localhost` — they silently no-op over a plain-HTTP LAN IP. Test share/copy on the deployed HTTPS URL.
6. **Don't run two repo-mutating/build workflows on the same working tree at once** (they clobber `.next` + git). Stop the dev server before a workflow runs its own builds.
7. **e2e + local dev now run against a LOCAL Supabase**, not prod (see "Local development DB"). CI's `e2e` job spins up an ephemeral local Supabase on the runner, runs `db:setup` (Drizzle migrate + seed), and Playwright against it — so `db:seed`/`db:migrate` in CI is now safe (ephemeral per-job DB, never prod). The "dedicated test DB" follow-up is effectively delivered for CI. Donor specs are still written **data-independently**; center specs **write a bounded pending test center**. The OTP test code (`123456`) comes from `[auth.sms.test_otp]` in `supabase/config.toml`. The `expire-requests.yml` cron still hits prod and keeps its prod secrets.
8. **OTP rate-limit**: Supabase throttles OTP sends per identity, so tests that each send an OTP must use **different** test emails (`TEST_CENTER_EMAIL` vs `TEST_CENTER_EMAIL_2` vs `TEST_ADMIN_EMAIL`). Locally the `[auth.email.test_otp]` map sidesteps real sending, but keep the split for parity.

## Workflow & CI/CD

- GitHub: `raulandreroman/venemed` (public). **`main` is protected** — PRs required, `ci` check (lint+tsc) must pass; admins may bypass for emergency hotfixes.
- Vercel git is connected: **push to `main` → production**, **PRs → preview** (preview deploys are auth-gated). CI jobs: `ci` (lint+tsc, required-ish), `e2e` (Playwright, informational for now — promote to required once stable).
- **Flow**: feature branch → PR → CI + preview → squash-merge → auto-deploy. Conventional commits; end commit messages with `Claude-Session: <url>`.
- **Stacked PRs**: retarget the child PR to `main` BEFORE merging/deleting the parent branch (deleting the parent auto-closes the child), then **rebase the child onto `main`** to drop the squashed-duplicate commits.
- **Multi-agent workflows** were used heavily (spec → validate → implement → verify → review → PR). When using one, bake in: lint in the verify gate, the action-safety guard (statically + dynamically import `"use server"` modules), and the gotchas above.

## Testing center flows manually

Center auth needs a Supabase **test email + fixed OTP code** (the local `[auth.email.test_otp]` map, and GitHub secrets `TEST_CENTER_EMAIL` / `TEST_CENTER_EMAIL_2` / `TEST_ADMIN_EMAIL` / `TEST_OTP_CODE`). To test login→dashboard, a center must exist and be `approved` (registration creates it as `pending_review`; approve by flipping `center.status` in the DB, optionally writing a `moderation_event`).

## Specs (canonical — keep in sync with code)

`docs/specs/`: `data-model.md`, `cron-jobs.md`, `donor-slice.md`, `donor-fidelity.md`, `center-auth.md`, `center-registration.md`, `center-edit.md`, `center-workspace.md` (Phase 3 scope — decisions locked), `e2e-smoke.md`. Diagrams in `docs/diagrams/`, the designer brief in `docs/briefs/`.

## Status & roadmap

**Done & in `main`**: donor surface (landing/list/detail-sheet, design-fidelity), cron + share tracking, CI/CD, e2e smoke, the **center back office** (auth + login, registration, edit center data) with the moderation gate, the **admin moderation UI** (login + queue + review + approve/reject), the **local dev DB** (local Supabase for dev + e2e), and **auto-migrate on prod deploy** (Vercel build step).

**Next**: **Phase 3** center workspace — *scoped & decisions locked in `docs/specs/center-workspace.md`*; building in 4 slices (1 dashboard → 2 create+selector+publish (incl. migration `0004`: `supply_category` 3→6 + `center.reception_paused_at`) → 3 detail+Finalizar+Extender → 4 profile+reception toggle). **Surplus** redesigned as a future center-level banner (own mini-spec, not a solicitud). Then **offline** (PWA read + draft-with-confirm — data-model sync columns: client `id`, `idempotency_key`, `updated_at`). (Auth moved to **email OTP** — the Twilio WhatsApp sender onboarding is no longer on the critical path.)
