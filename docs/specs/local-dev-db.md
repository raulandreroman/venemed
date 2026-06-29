# local-dev-db — Implementation Spec

> Status: spec (branch `feat/local-dev-db`, off `main`). Land via PR — `main` is
> **protected** (`ci` = lint + tsc must pass). Owner: platform.
> Target date context: 2026-06.

## 1. Why this exists

Today `pnpm dev`, `pnpm db:migrate`, `pnpm db:seed`, and `pnpm test:e2e` all run
against the **shared prod/cloud Supabase** (creds pulled from Vercel into
`.env.local`). Two concrete hazards fall out of that:

1. **`pnpm db:seed` is destructive** — it deletes+recreates `center` / `request`
   / `supply` (cascading `membership`). Running it locally nukes prod data.
   `AGENTS.md` literally warns "NEVER run in CI against the shared DB".
2. **e2e writes to prod** — `e2e/center.spec.ts` registers a bounded pending
   test center against the live DB, and CI needs the prod Supabase secrets to do
   it. A surge-critical app should not have its test suite mutating production.

The fix is a **fully-local Supabase stack** (Postgres + Auth + Storage) via the
Supabase CLI on Docker (already installed + running). Local dev and e2e run
against it by default; prod stays authoritative on Vercel and is never touched
by local/CI runs.

**Why not just a local Postgres container?** We use **Supabase Auth** as the
identity layer: `app_user.id` = `auth.users.id` (1:1), and login/registration go
through phone OTP. A bare Postgres has no `auth.users`, no GoTrue, no OTP. We
need the **full local Supabase stack**, so we use `supabase start`.

### Non-goals

- **Not** adopting Supabase's migration system. We keep **Drizzle**
  (`src/db/migrations` via drizzle-kit) as the single source of schema truth. We
  do **not** put anything in `supabase/migrations/`; `supabase start` boots a
  blank Postgres + auth and we apply Drizzle on top.
- **Not** changing the prod env model. Prod env vars remain authoritative on
  Vercel; `vercel env pull` restores them locally at any time.
- **Not** seeding/migrating against any remote DB from CI.
- **Not** enabling RLS — authorization stays in server code by `center_id`
  (per `AGENTS.md`); local Supabase is identity + a blank Postgres only.

## 2. Scope / deliverables

| # | Deliverable | File(s) |
|---|-------------|---------|
| 1 | Supabase CLI as a **devDependency** (no global install) | `package.json` |
| 2 | `supabase init` + minimal `supabase/config.toml` with phone auth + local test OTP | `supabase/config.toml` |
| 3 | Env strategy: back up prod → `.env.vercel.local`, write **local** creds into `.env.local` | `.env.local`, `.env.vercel.local`, `.env.example` |
| 4 | Lifecycle scripts (`supabase:start/stop/status`, `db:setup`, `dev:local`) | `package.json` |
| 5 | e2e CI job runs against **local** Supabase (install CLI, start, migrate+seed, env→local) | `.github/workflows/e2e.yml` |
| 6 | Docs: AGENTS.md local-dev section + this spec | `AGENTS.md`, this file |

## 3. Current state (verified against `feat/local-dev-db`)

- Docker running. **Supabase CLI not installed.** No `supabase/` dir.
- 3 Drizzle migrations in `src/db/migrations/`
  (`0000_acoustic_shockwave.sql`, `0001_tiresome_nocturne.sql`,
  `0002_slimy_luckman.sql`) + `meta/`.
- `.env.local` holds **prod/cloud** Supabase creds (pulled from Vercel).
- `.gitignore` ignores `.env*` except `!.env.example` (and `.env*.local`), and
  ignores `.vercel`. So `.env.local` and `.env.vercel.local` are **both
  gitignored** — safe.
- Env var contract (from `AGENTS.md` + `.env.example` + code):
  - `POSTGRES_URL` — pooler, runtime, `postgres({ prepare:false })`
    (`src/db/index.ts`).
  - `POSTGRES_URL_NON_POOLING` — direct, used by drizzle migrate
    (`drizzle.config.ts`) and `db:seed` (`src/db/seed.ts`).
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
    `SUPABASE_SERVICE_ROLE_KEY`.
  - `CRON_SECRET`, `TEST_CENTER_PHONE`, `TEST_CENTER_PHONE_2`,
    `TEST_ADMIN_PHONE`, `TEST_OTP_CODE`.
- `drizzle.config.ts` and `src/db/seed.ts` both load env via
  `config({ path: ".env.local" }); config();` — so **whatever is in
  `.env.local` wins**. This is the lever: put local creds there → everything is
  local by default.
- e2e: `playwright.config.ts` builds+serves on `:3210`; `e2e/center.spec.ts`
  fills the **national-digit** phone (`TEST_CENTER_PHONE` e.g. `4241234567`) into
  a `tel` input; the app's `normalizeVePhone()` canonicalizes it to
  `+584241234567` before calling Supabase OTP. So the Supabase test-OTP entry
  must be keyed on the **canonical E.164 digits** `584241234567`.

## 4. Decisions

### 4.1 CLI install — devDependency, not global

Add `supabase` as a **devDependency** and invoke via `pnpm exec supabase` /
package.json scripts. Rationale: a global install is not reproducible in CI and
drifts per-machine; a pinned devDependency installs with
`pnpm install --frozen-lockfile` and gives CI + every dev the same version.

```bash
pnpm add -D supabase
```

All invocations are `pnpm exec supabase <cmd>` (wrapped by the scripts in §4.4).

> The `supabase` npm package is a thin launcher that downloads the matching
> native binary on install. CI already runs `pnpm install --frozen-lockfile`, so
> it's available there with no extra setup step beyond Docker being present on
> the runner (GitHub `ubuntu-latest` ships Docker).

### 4.2 `supabase init` + minimal `config.toml`

Run once, committed to the repo:

```bash
pnpm exec supabase init
```

This creates `supabase/config.toml` and a `supabase/.gitignore`. We keep
**only** what we need and **do not** use `supabase/migrations/` (Drizzle owns
migrations). Edits to `supabase/config.toml`:

1. Keep the default local ports (the deterministic ones we rely on):
   API `54321`, DB `54322`, Studio `54323`.
2. **Enable phone auth + local test OTP.** Map the two canonical center numbers
   used by the e2e to the fixed code `123456`. Keys are **E.164 digits without
   the `+`**:

```toml
[auth]
enabled = true
# Local dev only; never used in prod (prod auth lives on cloud Supabase).
site_url = "http://127.0.0.1:3140"
additional_redirect_urls = ["http://127.0.0.1:3140", "http://127.0.0.1:3210"]

[auth.sms]
enable_signup = true
enable_confirmations = false
# No real SMS provider locally — test_otp short-circuits sending entirely.

[auth.sms.test_otp]
# Canonical E.164 digits (no '+', no trunk 0) → fixed OTP. These are the numbers
# normalizeVePhone() produces from TEST_CENTER_PHONE / TEST_CENTER_PHONE_2.
"584241234567" = "123456"   # TEST_CENTER_PHONE  (login spec)
"584221234567" = "123456"   # TEST_CENTER_PHONE_2 (registration spec)
```

Notes:
- Keep everything else at `supabase init` defaults; do not hand-tune Storage /
  Realtime / Inbucket unless a spec later needs it.
- `enable_confirmations = false` keeps the offline flow simple (no email/SMS
  round-trip); the test_otp map is what makes login/registration work fully
  offline.
- If the admin moderation e2e later needs a third number, add
  `"584261234567" = "123456"` (matches `TEST_ADMIN_PHONE` `4261234567`).
- We **edit `config.toml` only** — no files under `supabase/migrations/`.

### 4.3 Env strategy (the crux)

**Goal:** local dev gets local creds by default, prod stays recoverable.

Local Supabase keys/URLs are **deterministic and public** (the anon/service
keys printed by `supabase status` are the well-known local demo keys — safe to
commit/inline). The DB and API URLs are fixed:

- API: `http://127.0.0.1:54321`
- DB: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`

The local stack has **no pooler**, so both `POSTGRES_URL` and
`POSTGRES_URL_NON_POOLING` point at the same `54322` direct connection.
`prepare:false` (in `src/db/index.ts`) is harmless against a direct connection,
so no code change is needed.

**One-time migration of `.env.local`:**

```bash
# 1. Back up the current PROD creds for recovery (gitignored; never committed).
cp .env.local .env.vercel.local

# 2. Read the real local keys (do NOT guess them).
pnpm exec supabase status        # or: supabase status -o env

# 3. Overwrite .env.local with LOCAL creds (template below; fill keys from status).
```

**`.env.local` (LOCAL — what everything uses by default):**

```dotenv
# === LOCAL Supabase (supabase start). NOT prod. Prod backed up in .env.vercel.local ===
# Local stack has no pooler → both URLs are the same direct 54322 connection.
POSTGRES_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
POSTGRES_URL_NON_POOLING="postgresql://postgres:postgres@127.0.0.1:54322/postgres"

NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
# These anon/service keys are the deterministic local demo keys — read the exact
# values from `supabase status`; they are public, not secrets.
NEXT_PUBLIC_SUPABASE_ANON_KEY="<paste from `supabase status` → anon key>"
SUPABASE_SERVICE_ROLE_KEY="<paste from `supabase status` → service_role key>"

# Local cron secret (any non-empty value; only /api/cron/* checks it locally).
CRON_SECRET="local-dev-cron-secret"

# Center e2e / manual login — national digits; the app normalizes to +58…,
# which matches the [auth.sms.test_otp] keys in supabase/config.toml.
TEST_CENTER_PHONE="4241234567"
TEST_CENTER_PHONE_2="4221234567"
TEST_OTP_CODE="123456"
```

**Recovery (restore prod creds locally) — either:**

```bash
cp .env.vercel.local .env.local      # quick restore from backup
# or, canonical source of truth:
vercel env pull .env.local           # re-pull from Vercel
```

**`.env.example`** — add a documented LOCAL block alongside the existing
Vercel-pull instructions so a new dev can choose local-first dev:

```dotenv
# ----------------------------------------------------------------------------
# LOCAL DEV (recommended): run a fully-local Supabase via the CLI + Docker.
#   pnpm supabase:start && pnpm db:setup && pnpm dev
# Then .env.local should contain the LOCAL values below. The anon/service keys
# are the deterministic local demo keys — copy the exact values printed by
#   pnpm exec supabase status
# Local Supabase has NO pooler, so both POSTGRES URLs use the direct :54322 port.
#
# POSTGRES_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
# POSTGRES_URL_NON_POOLING="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
# NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
# NEXT_PUBLIC_SUPABASE_ANON_KEY="<supabase status → anon key>"
# SUPABASE_SERVICE_ROLE_KEY="<supabase status → service_role key>"
# CRON_SECRET="local-dev-cron-secret"
# TEST_CENTER_PHONE="4241234567"
# TEST_CENTER_PHONE_2="4221234567"
# TEST_OTP_CODE="123456"     # matches [auth.sms.test_otp] in supabase/config.toml
#
# To use PROD creds instead (read-only debugging), restore with:
#   vercel env pull .env.local      (prod stays authoritative on Vercel)
# ----------------------------------------------------------------------------
```

> **Why this is safe:** `.gitignore` already excludes `.env*` (except
> `.env.example`) and `.env*.local`, so both `.env.local` and `.env.vercel.local`
> are never committed. Prod env remains the source of truth on Vercel.

### 4.4 Lifecycle scripts (`package.json`)

Add scripts that wrap the CLI and chain the **Drizzle** migrate+seed (not
supabase migrations):

```jsonc
{
  "scripts": {
    // ── local Supabase lifecycle ──
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "supabase:status": "supabase status",
    // schema via DRIZZLE (migrate) then sample data (seed) against local .env.local
    "db:setup": "pnpm db:migrate && pnpm db:seed",
    // one-shot: boot local stack, apply schema+seed, then dev server
    "dev:local": "pnpm supabase:start && pnpm db:setup && pnpm dev"
  }
}
```

(`db:migrate`, `db:seed`, `dev` already exist; these compose them.) Because the
scripts invoke `supabase` via `pnpm` they resolve the devDependency binary — no
global install. `db:setup` runs against whatever `.env.local` points at, which
is now local.

**Standard local loop:**

```bash
pnpm supabase:start   # blank Postgres + Auth + Storage on Docker
pnpm db:setup         # drizzle migrate + seed → local DB
pnpm dev              # serves against local
# … work …
pnpm supabase:stop    # tear down when done (data persists across start/stop)
```

> Heed `AGENTS.md` gotcha #6: don't run two build/mutating workflows on the same
> tree at once. Stop `pnpm dev` before `pnpm test:e2e` (it does its own build on
> `:3210`).

### 4.5 CI — e2e against LOCAL Supabase

Switch `.github/workflows/e2e.yml` so the e2e job spins up a **local** Supabase
on the runner, applies Drizzle migrate + seed, and runs Playwright against it.
This removes prod-DB writes and the prod Supabase secrets from CI. Because local
keys are public/deterministic, they're **inlined** (not GitHub secrets):

```yaml
name: e2e

on:
  pull_request:
  push:
    branches: [main]

jobs:
  e2e:
    name: e2e # promote to a required check once stable
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      # Start the LOCAL Supabase stack (Docker ships on ubuntu-latest).
      # supabase CLI is a devDependency → available via pnpm exec.
      - name: Start local Supabase
        run: pnpm exec supabase start

      # Export the deterministic local creds into $GITHUB_ENV so later steps
      # (build + runtime) can read them. `-o env` emits SUPABASE_ANON_KEY,
      # SUPABASE_SERVICE_ROLE_KEY, API_URL, DB_URL, etc. This MUST run before
      # the Playwright step: NEXT_PUBLIC_SUPABASE_ANON_KEY is inlined into the
      # client bundle at build time, so it has to be populated up front or the
      # center login/registration specs hit an empty anon key and fail.
      - name: Export local Supabase env
        run: pnpm exec supabase status -o env >> "$GITHUB_ENV"

      - run: npx playwright install --with-deps chromium

      # Schema via DRIZZLE (not supabase migrations) + sample data, on LOCAL.
      # Safe to seed here: it's an ephemeral per-job DB, never prod.
      - name: Migrate + seed local DB
        run: pnpm db:setup
        env:
          POSTGRES_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
          POSTGRES_URL_NON_POOLING: postgresql://postgres:postgres@127.0.0.1:54322/postgres
          # Seed/server code that uses the admin client needs the service role key.
          SUPABASE_SERVICE_ROLE_KEY: ${{ env.SUPABASE_SERVICE_ROLE_KEY }}

      - name: Run Playwright (against local Supabase)
        run: pnpm test:e2e
        env:
          # Local Supabase — deterministic, public keys (NOT secrets).
          # Both keys come from the "Export local Supabase env" step above.
          NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ env.SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ env.SUPABASE_SERVICE_ROLE_KEY }}
          POSTGRES_URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
          POSTGRES_URL_NON_POOLING: postgresql://postgres:postgres@127.0.0.1:54322/postgres
          CRON_SECRET: local-ci-cron-secret
          # Center e2e uses the local test OTP wired in supabase/config.toml.
          TEST_CENTER_PHONE: "4241234567"
          TEST_CENTER_PHONE_2: "4221234567"
          TEST_OTP_CODE: "123456"

      - name: Stop local Supabase
        if: always()
        run: pnpm exec supabase stop

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

Two robustness notes for the **implement** phase:

1. **Anon / service-role key sourcing (load-bearing — do not skip).** The
   **`Export local Supabase env`** step above is part of the job's step list, not
   optional commentary: it runs immediately after `supabase start` and before
   Playwright, piping `pnpm exec supabase status -o env >> "$GITHUB_ENV"` so
   `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `API_URL` / `DB_URL` are
   available to every later step. The Playwright step then maps
   `${{ env.SUPABASE_ANON_KEY }}` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
   `${{ env.SUPABASE_SERVICE_ROLE_KEY }}` → `SUPABASE_SERVICE_ROLE_KEY`; the
   migrate+seed step maps the service-role key the same way for `db:seed` /
   server code that uses the admin client.

   This step is **mandatory** because `NEXT_PUBLIC_SUPABASE_ANON_KEY` is inlined
   into the client bundle at **build time** (`pnpm test:e2e` builds the app) and
   also read at runtime. If the export step is missing, the anon key is empty at
   both build and runtime and the center login / registration specs fail. The
   ordering matters too: it must run **before** the Playwright build/serve step,
   not after.

   The exact `-o env` key names are CLI-version dependent. The implementer
   verifies them against the installed CLI version (`pnpm exec supabase status
   -o env`). If a future CLI renames them, either adjust the `${{ env.* }}`
   references to match, or **hardcode the public local anon/service-role JWTs**
   directly in the Playwright/seed `env:` blocks — they are the well-known,
   deterministic local demo keys (public, not secrets), so inlining them is
   acceptable and keeps the job self-contained.
2. **Secrets removed.** Delete the `secrets.NEXT_PUBLIC_SUPABASE_*` /
   `secrets.POSTGRES_*` / `secrets.TEST_*` references from this workflow. They're
   no longer needed here (prod secrets stay on Vercel + on the
   `expire-requests.yml` cron, which still hits prod).

> `e2e/center.spec.ts` already `test.skip`s unless `TEST_OTP_CODE` + phones are
> set; with them inlined above (and the test_otp map in `config.toml`), the
> center login + registration specs **run** and write to the **local** DB. The
> donor spec runs regardless.

### 4.6 Docs

- **AGENTS.md** — add a "Local dev database" subsection under Commands/Testing:
  the `pnpm supabase:start && pnpm db:setup && pnpm dev` loop, the env-backup
  note (`.env.vercel.local` for recovery, `vercel env pull` to restore), and
  update gotcha #7 ("e2e runs against the shared prod Supabase DB") to reflect
  that **local + CI now run against a local Supabase**; the "dedicated test DB"
  follow-up is effectively delivered for CI. Note migrations stay Drizzle-owned
  (nothing in `supabase/migrations/`).
- **This spec** — canonical reference.

## 5. Acceptance criteria

1. `pnpm exec supabase start` boots; `pnpm db:setup` applies all 3 Drizzle
   migrations + seeds against the local DB with no error.
2. `pnpm dev` serves against local (donor list shows seeded requests; no prod
   connection).
3. `pnpm test:e2e` locally: **donor** spec passes; **center** login +
   registration pass via local test OTP (`123456`), writing to **local**.
4. CI `e2e` job: same, on an ephemeral local Supabase; no prod Supabase secrets
   referenced; donor + center specs green.
5. `pnpm lint` + `npx tsc --noEmit` green (no app code change required, but
   verify).
6. **Prod untouched + recoverable**: prod env still authoritative on Vercel;
   `.env.vercel.local` holds the backup; `vercel env pull .env.local` restores
   it. No `.env*` (except `.env.example`) committed.

## 6. Risks / notes

- **Docker required.** `supabase start` needs Docker running locally and on the
  CI runner (ubuntu-latest has it). First `start` pulls images (slow once).
- **No pooler locally** → both POSTGRES URLs use `:54322`. `prepare:false`
  stays; it's a no-op against a direct connection, so `src/db/index.ts` is
  unchanged.
- **CI cold start** adds image-pull time to the e2e job; acceptable since e2e is
  informational until promoted to required.
- **Local keys are public** — safe to inline in CI and document in
  `.env.example`. Do **not** inline any prod key.
- **`supabase init` extras** — if `init` scaffolds `supabase/seed.sql` or a
  `supabase/migrations/` dir, leave them empty/unused; Drizzle owns schema +
  seed. Keep `config.toml` minimal.
- **Secure-context APIs** (`navigator.share`/`clipboard`) still only work on
  `localhost`/HTTPS (AGENTS.md gotcha #5) — local dev on `127.0.0.1` is fine.
