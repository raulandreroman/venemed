<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# VeneMed — Agent Guide

Read this before working in the repo. It captures the product, architecture, conventions, and the hard-won gotchas so you can pick up development without relearning them.

## What VeneMed is

A **list-based medical-aid platform for Venezuela**. Health centers (hospitals, clinics, elderly homes, children's shelters, collection centers) each maintain **one living lista** — a single evergreen board of the supplies (*insumos*) they need right now, in three buckets: **Urgente / Necesitamos / No aceptamos**. There is **no countdown**. A lista never expires on a timer; it just gets **stale** (`now − updated_at`) and a freshness nudge ("Actualizada hace 5 días · ¿sigue vigente?") asks the center to re-confirm. Stale listas **sink in the donor ordering** instead of being taken down. Donors browse **anonymously, no login**, and share a center's lista as a link. Spanish (es-VE), mobile-first (390px). Built fast in response to an earthquake; reliability under a donor traffic surge matters.

> **Model history**: VeneMed began *time-windowed* (per-request *solicitudes* with a 12/24/48h countdown + expiry cron). It pivoted to the evergreen **lista** model above — `request`→`lista`, one lista per center, freshness instead of expiry, per-item urgency, excess folded in as an item bucket. Canonical model: [`docs/specs/lista-model-v2.md`](docs/specs/lista-model-v2.md). Treat any lingering "solicitud / ventana / countdown / expiry" reference as removed.

**Three surfaces:**
- **Donor (public, no auth)** — landing, active-listas list (**one card per center**), lista detail (as a bottom-sheet). The surge lands here → it's CDN-cached.
- **Center (back office, auth)** — registration, email-OTP login, one-lista dashboard (freshness card + Urgente/Necesitamos/No aceptamos), create-once/edit editor, team roles + invitations, edit center data, reception toggle.
- **Admin (moderation)** — vets centers (`pending_review → approved/rejected`). Built (login + queue + review + approve/reject).

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
    (public)/            # donor surface → "/", /listas, /listas/[id]  (one card per center)
      listas/[id]/       # detail; opens as an INTERCEPTED bottom-sheet (@modal) over the list, full-page on direct load
    (center)/            # back office (gated by middleware)
      centro/{login,registro,editar,en-revision,rechazado,perfil,lista,equipo,unirse}/ + centro (dashboard)
    actions/             # "use server" actions (auth, registro, editar, publicar/gestionar lista, share, team)
    (admin)/             # moderation (login + queue + centros/[id] review)
  components/ui/         # design-system primitives (Button, Chip, Tag, StatusBadge, RoleTag, AppBar, …) — no Countdown
  db/                    # schema.ts, index.ts (db), queries.ts, admin-queries.ts, seed.ts, migrations/  (no jobs.ts — expiry cron retired)
  lib/
    supabase/{server,client,middleware}.ts   # @supabase/ssr
    auth/                # getCurrentCenter, requireCenter, on-login (status routing)
    listas/, team/, registro/validation.ts, geo/ve-states.ts, format.ts, flags.ts
  middleware.ts          # session refresh + gates (center) routes
e2e/                     # Playwright specs (donor.spec always-on; center.spec gated)
docs/specs/              # the canonical specs — READ THESE (lista-model-v2 is the model of record; center-*, admin-*, e2e)
.github/workflows/       # ci.yml (lint+tsc), e2e.yml   (no expire-requests — cron retired)
```

## Architecture & key decisions

- **Data access is Drizzle/postgres-js, which bypasses RLS.** So **Supabase Auth is only the identity/session layer** — *authorization is enforced in server code by the logged-in center's `center_id`*, never RLS. Do not rely on RLS for app data.
- **Identity model**: `app_user.id` = the Supabase `auth.users` uid (1:1). `membership` links `app_user → center` (one per center in v1, enforced by a unique index). `center.status` is the moderation gate; login/registration route by it (`approved → /centro`, `pending_review → /centro/en-revision`, `rejected → /centro/rechazado`, no membership → `/centro/registro`). Helpers: `getCurrentCenter()`, `requireCenter()`, `resolveLoginDestination()`.
- **Lista lifecycle**: `draft → active → paused → closed` (terminal: closed). **No `expired` state** — no timer takes a lista down. **One active lista per center** (partial unique index on `center_id where status in ('active','paused')`); create-once, edit thereafter. Items (`lista_item`) carry `bucket` (`need | excess`) + `is_urgent`; the three donor/dashboard sections are read-time derivations — Urgente = `need ∧ is_urgent`, Necesitamos = `need ∧ ¬is_urgent`, No aceptamos = `excess`. `request.kind`/`title`/`window_hours`/`expires_at` are **gone**; `excess_reason` (≤40) lives on the lista. Delivery: center address inherited + optional per-lista `delivery_instructions`. `city` + `categories[]` are **denormalized onto `lista`** at publish for the cached donor list.
- **Freshness replaces the window**: staleness = `now − updated_at`. The dashboard nudges at **≥3 days** ("¿sigue vigente?"); "Sí, sigue vigente" touches `updated_at` (content-free reconfirm). The donor list sorts **fresh-first** and **sinks stale listas (>7d)** rather than removing them. No background job — freshness is computed at read time.
- **Caching the surge**: donor reads are cached (`revalidate`/`unstable_cache` with tags `active-listas`, `landing-stats`, `lista:<id>`). Edit/reconfirm/pause + `recordShare` call `revalidateTag(tag, "max")` (Next 16 requires the 2-arg form). Note: `recordShare` deliberately revalidates `lista:<id>` + `landing-stats` but **not** `active-listas` (the card shows no share count).
- **No cron.** The expiry cron (`jobs.ts:expireDueRequests`, `/api/cron/expire-requests`, `expire-requests.yml`) was **deleted** with the pivot — there is no scheduled job in the app.

## Conventions

- **Identifiers English, UI copy Spanish.** Table/column/enum names are English (`lista` = the center's list, `supply` = *insumo*, `center` = *centro*); user-facing strings are es-VE.
- **Design system** (`src/components/ui` + `globals.css` tokens, from the Figma UI Kit): font **Inter**; type scale Display 28 / H1 22 / H2 18 / Body 16 / Label 14 / Caption 12. **Single-accent principle: the blue accent (`#1F5AA8`) is ONLY for actions** (buttons, links, active/selected, focus). Everything else is neutral; semantic colors (`success/warning/error` + tints) ONLY signal state. Exact tokens are in `globals.css` — use them, don't hardcode hex. Mobile-first 390px.
- **Match the surrounding code.** Server Components by default; `"use client"` only where interactivity needs it.

## Gotchas / hard-won lessons (read before writing center/action code)

1. **A `"use server"` file may export ONLY async functions.** No `export type`/const/non-function exports — the server-action transform references them at runtime → `X is not defined` when the action is invoked. Import types with `import type`.
2. **`build` + `curl GET` smoke does NOT exercise server actions or form submits** — that's how three action-invocation bugs shipped. Verify with the **Playwright e2e** (it submits forms / invokes actions), and when adding actions, drive the actual submit.
3. **Next 16 specifics**: `cookies()` is **async** (await it); keep `src/middleware.ts` (the deprecation warning is fine); `react-hooks/set-state-in-effect` is a **hard eslint error** (never call `setState` synchronously in a `useEffect` body — defer via `requestAnimationFrame`); `revalidateTag` needs the **two-arg** form `revalidateTag(tag, "max")`; redirects from middleware/actions must carry the refreshed auth cookies.
4. **Auth identity is the verified email** (migration 0008). `app_user.email` (unique) = the Supabase-verified session email, lowercased — set by `resolveLoginDestination()` / the registro action from `user.email`, never client input. `app_user.phone` was DROPPED (also a privacy win — removed the top-risk operator PII). `center.whatsapp_phone` is now an OPTIONAL, editable, unverified contact field (`normalizeVePhone()` still validates/normalizes it, but it is no longer tied to the session). Use `normalizeEmail()` for the login/identity email.
5. **Secure-context APIs**: `navigator.share` / `navigator.clipboard` only work on HTTPS or `localhost` — they silently no-op over a plain-HTTP LAN IP. Test share/copy on the deployed HTTPS URL.
6. **Don't run two repo-mutating/build workflows on the same working tree at once** (they clobber `.next` + git). Stop the dev server before a workflow runs its own builds.
7. **e2e + local dev now run against a LOCAL Supabase**, not prod (see "Local development DB"). CI's `e2e` job spins up an ephemeral local Supabase on the runner, runs `db:setup` (Drizzle migrate + seed), and Playwright against it — so `db:seed`/`db:migrate` in CI is now safe (ephemeral per-job DB, never prod). The "dedicated test DB" follow-up is effectively delivered for CI. Donor specs are still written **data-independently**; center specs **write a bounded pending test center**. The OTP test code (`123456`) comes from `[auth.email.test_otp]` in `supabase/config.toml`. (There is no cron workflow anymore — `expire-requests.yml` was retired with the lista pivot.)
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

`docs/specs/`: **`lista-model-v2.md`** is the model of record (entity, data model, freshness, donor surface, author/edit flow — supersedes the retired time-window specs). Surface specs: `center-auth.md`, `center-registration.md`, `center-edit.md`, `admin-moderation.md`, `e2e-smoke.md`, `local-dev-db.md`, `ui-kit-audit.md`. Diagrams in `docs/diagrams/`, the designer brief in `docs/briefs/`. *(The old `data-model.md` / `cron-jobs.md` / `donor-slice.md` / `donor-fidelity.md` / `aviso-exceso.md` / `center-workspace.md` / `backend-fields-cron.md` were folded into `lista-model-v2.md` and removed.)*

## Status & roadmap

**Done & in `main`**: the **lista model v2** (`request`→`lista`, no time windows, freshness + per-item urgency, excess as an item bucket, expiry cron retired), the **donor surface** (landing / one-card-per-center list / detail-sheet, share tracking, design-fidelity), the **center back office** (email-OTP auth + login, registration, edit center data, one-lista dashboard + create-once/edit editor, reception toggle, **team roles + single-use email invitations**) behind the moderation gate, the **admin moderation UI** (login + queue + review + approve/reject), the **local dev DB** (local Supabase for dev + e2e), **auto-migrate on prod deploy** (Vercel build step), and the **UI-kit audit** (token foundation + primitives).

**Next**: **offline** (PWA read + draft-with-confirm — data-model sync columns: client `id`, `idempotency_key`, `updated_at`) and the **admin centers directory / suspend UI**. **Surplus** already redesigned as the `excess` item bucket on the lista (not a separate entity).
