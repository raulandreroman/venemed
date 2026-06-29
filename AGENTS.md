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
- **Auth**: Supabase Auth phone OTP via **Twilio Verify**, **WhatsApp-primary / SMS-fallback** (WhatsApp has far better deliverability in Venezuela). SMS-first at launch; WhatsApp auto-promotes once the Meta sender is approved.
- **Hosting**: Vercel (Fluid Compute). Prod: `https://venemed.vercel.app`.

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

Env comes from `.env.local` (gitignored). See `.env.example`. The Supabase env names are `POSTGRES_URL` (pooler, runtime, `prepare:false`), `POSTGRES_URL_NON_POOLING` (direct, migrations), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Plus `CRON_SECRET`, `TEST_CENTER_PHONE`, `TEST_CENTER_PHONE_2`, `TEST_OTP_CODE`. **Local dev + e2e default to a local Supabase** (below); `vercel env pull .env.local` restores the prod creds when you need them.

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
- **Offline phone OTP.** `supabase/config.toml` enables phone auth + an `[auth.sms.test_otp]` map (`584241234567` and `584221234567` → `123456`) so center login/registration work fully offline. The keys are canonical E.164 digits (what `normalizeVePhone()` produces from `TEST_CENTER_PHONE` / `TEST_CENTER_PHONE_2`). A dummy Twilio provider is enabled so GoTrue keeps phone login active; `test_otp` short-circuits any real send.
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
4. **Phone normalization**: always use `normalizeVePhone()` — it strips `+58` then a trunk `0` and returns canonical `+58XXXXXXXXXX`. The OTP-verified session phone is the only source of truth for `center.whatsapp_phone`. Supabase test numbers must be configured in canonical E.164 (no trunk `0`), or the app's send won't match them.
5. **Secure-context APIs**: `navigator.share` / `navigator.clipboard` only work on HTTPS or `localhost` — they silently no-op over a plain-HTTP LAN IP. Test share/copy on the deployed HTTPS URL.
6. **Don't run two repo-mutating/build workflows on the same working tree at once** (they clobber `.next` + git). Stop the dev server before a workflow runs its own builds.
7. **e2e + local dev now run against a LOCAL Supabase**, not prod (see "Local development DB"). CI's `e2e` job spins up an ephemeral local Supabase on the runner, runs `db:setup` (Drizzle migrate + seed), and Playwright against it — so `db:seed`/`db:migrate` in CI is now safe (ephemeral per-job DB, never prod). The "dedicated test DB" follow-up is effectively delivered for CI. Donor specs are still written **data-independently**; center specs **write a bounded pending test center**. The OTP test code (`123456`) comes from `[auth.sms.test_otp]` in `supabase/config.toml`. The `expire-requests.yml` cron still hits prod and keeps its prod secrets.
8. **OTP rate-limit**: against cloud Supabase, sends are limited to ~1/min per number, so tests that each send an OTP must use **different** test numbers (`TEST_CENTER_PHONE` vs `TEST_CENTER_PHONE_2`). Locally the `test_otp` map sidesteps real sending, but keep the two-number split for parity.

## Workflow & CI/CD

- GitHub: `raulandreroman/venemed` (public). **`main` is protected** — PRs required, `ci` check (lint+tsc) must pass; admins may bypass for emergency hotfixes.
- Vercel git is connected: **push to `main` → production**, **PRs → preview** (preview deploys are auth-gated). CI jobs: `ci` (lint+tsc, required-ish), `e2e` (Playwright, informational for now — promote to required once stable).
- **Flow**: feature branch → PR → CI + preview → squash-merge → auto-deploy. Conventional commits; end commit messages with `Claude-Session: <url>`.
- **Stacked PRs**: retarget the child PR to `main` BEFORE merging/deleting the parent branch (deleting the parent auto-closes the child), then **rebase the child onto `main`** to drop the squashed-duplicate commits.
- **Multi-agent workflows** were used heavily (spec → validate → implement → verify → review → PR). When using one, bake in: lint in the verify gate, the action-safety guard (statically + dynamically import `"use server"` modules), and the gotchas above.

## Testing center flows manually

Center auth needs a Supabase **test phone number + fixed OTP code** (configured in Supabase Auth → Phone, and as GitHub secrets `TEST_CENTER_PHONE` / `TEST_CENTER_PHONE_2` / `TEST_OTP_CODE`). To test login→dashboard, a center must exist and be `approved` (registration creates it as `pending_review`; approve by flipping `center.status` in the DB, optionally writing a `moderation_event`).

## Specs (canonical — keep in sync with code)

`docs/specs/`: `data-model.md`, `cron-jobs.md`, `donor-slice.md`, `donor-fidelity.md`, `center-auth.md`, `center-registration.md`, `center-edit.md`, `e2e-smoke.md`. Diagrams in `docs/diagrams/`, the designer brief in `docs/briefs/`.

## Status & roadmap

**Done & in `main`**: donor surface (landing/list/detail-sheet, design-fidelity), cron + share tracking, CI/CD, e2e smoke, and the **center back office** (auth + login, registration, edit center data) with the moderation gate.

**Next**: admin **moderation UI** (approve/reject centers); **Phase 3** center workspace (real dashboard + create-solicitud + insumo selector + manage with Finalizar/Extender); **offline** (PWA read + draft-with-confirm — see the data-model sync columns: client `id`, `idempotency_key`, `updated_at`); a **dedicated test DB** for e2e; and finishing the Twilio WhatsApp sender onboarding.
