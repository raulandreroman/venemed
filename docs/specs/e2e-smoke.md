# e2e-smoke — Implementation Spec

> Status: spec (branch `feat/e2e`, off `main`). Land via PR — `main` is protected.
> Owner: platform. Target: minimal, happy-path Playwright smoke that actually
> **submits forms / invokes server actions**.

## 1. Why this exists

This week, build + `curl`-GET smoke checks were green while **three
action-invocation bugs** shipped or nearly shipped:

1. A `"use server"` **type re-export** that compiled fine but threw
   `X is not defined` at action-invocation time.
2. A **phone-normalization mismatch** between client input and the action's
   expectation.
3. (Same class.) Both bugs only fired **when a server action actually ran** —
   never on a build or a GET.

`next build` proves the app compiles. `curl /` proves a page renders. Neither
proves a **server action survives invocation**. The gap is exactly the surface
that breaks during a surge: a donor opening a request, a center submitting a
registration. This e2e is that safety net — it **drives the browser, submits
forms, and asserts no runtime error overlay / 500**.

### Non-goals

- Not full coverage. No edge cases, no validation-error matrices, no visual
  regression, no a11y audit. Two specs, happy path only.
- Not a DB-state test. We assert **screens and the absence of crashes**, not row
  counts.
- Not a replacement for `pnpm lint` + `npx tsc --noEmit` (those stay required).

## 2. Scope

| # | Deliverable | Always-on? |
|---|-------------|-----------|
| 1 | `playwright.config.ts` + `package.json` script `test:e2e` | infra |
| 2 | `e2e/donor.spec.ts` — landing → solicitudes → detail sheet | **YES** (surge-critical) |
| 3 | `e2e/center.spec.ts` — login + registration submit | **GATED** on `TEST_OTP_CODE` |
| 4 | `.github/workflows/e2e.yml` — PR + push-to-main, HTML report artifact | CI |
| 5 | GitHub secrets wired in implement phase (`TEST_OTP_CODE` left to user) | ops |

## 3. App facts (verified against `feat/e2e` source)

Spanish (es-VE), mobile-first, design viewport ~390px.

### Donor (public, no auth, read-only)

- `/` — landing. `<h1>` = `El puente directo entre tu ayuda y los hospitales.`
  CTA link **`Ver solicitudes activas`** → `/solicitudes`.
  (`src/app/(public)/page.tsx`)
- `/solicitudes` — `AppBar` with `<h1>` title **`Solicitudes activas`**, then a
  list of `RequestCard`s. Each card shows the **center name** in an `<h3>`, plus
  a footer with **`Compartir`** (`ShareCardButton`) and a primary
  **`Ver detalle`** link/button (`href="/solicitudes/{id}"`).
  (`src/app/(public)/solicitudes/page.tsx`, `src/components/ui/request-card.tsx`)
- Clicking **`Ver detalle`** from the list uses the **intercepting parallel
  route** (`@modal/(.)solicitudes/[id]`) → opens the detail as a **bottom-sheet
  dialog** rendered over the list:
  `role="dialog"` + `aria-label="Detalle de solicitud"`, with a close control
  `aria-label="Cerrar"`. (`src/app/(public)/solicitudes/[id]/_components/request-sheet.tsx`)
- Direct visit to `/solicitudes/{id}` renders the **full page** (not the sheet).
- **Seeded data exists** (`pnpm db:seed`): centers
  **`Hospital J.M. de los Ríos`** and **`Refugio Casa Esperanza`**. At least one
  active request from a seeded center is expected on `/solicitudes`.

### Center (auth-gated)

- `/centro/login` — `login-form.tsx`. Phone field is a single
  `<input type="tel" inputmode="numeric" placeholder="412 000 0000">` (national
  digits, +58 implied). Submit **`Enviar código`** → 6-box OTP step → **`Verificar`**.
- OTP step (`_components/otp-step.tsx`) renders **6 single-char inputs**, each
  `maxLength=1`, `aria-label="Dígito 1"` … `"Dígito 6"`. Submit button text
  **`Verificar`** (→ `Verificando…` while pending).
- `/centro/registro` — `registro-wizard.tsx`. R0 intro with **`Comenzar`** →
  `datos` form (`center-datos-form.tsx`) → submit **`Continuar`** sends OTP →
  OTP step → on success redirects to **`/centro/en-revision`**.
- `/centro` — dashboard, gated. `AppBar` title **`Panel del centro`**.
  Unauthenticated → **307 → `/centro/login`**.
- `/centro/en-revision` — `<h1>` = **`Estamos verificando tu centro`**.
- `/centro/editar` — gated edit form.
- **Auth uses a Supabase TEST phone + fixed OTP** configured in Supabase (not
  secrets-in-repo). Supplied via env:
  - `TEST_CENTER_PHONE` — national digits, e.g. `4241234567`.
  - `TEST_OTP_CODE` — 6 digits. **Not yet confirmed**, so center e2e **skips**
    when unset.

### Registration datos form fields (`center-datos-form.tsx`)

Used by the registration submit flow. Fields (label → control):

| Label | Control | Fill value (e2e) |
|-------|---------|------------------|
| `Nombre del centro` | `TextField` (text input) | `Centro E2E Smoke` |
| `Tipo de centro` | native `<select>` | first non-placeholder option |
| `Estado` | native `<select>` | first VE state option |
| `Ciudad` | `TextField` | `Caracas` |
| `Dirección` | `TextField` | `Av. Principal, sector e2e` |
| `Referencia (opcional)` | `TextField` | skip |
| `Horario de atención (opcional)` | `TextField` | skip |
| contact phone | `PhoneField` (`type=tel`) | `TEST_CENTER_PHONE` |
| `Nombre y apellido` | `TextField` | `Coordinador E2E` |

Selects are **native `<select>`** → use Playwright `selectOption({ index: 1 })`
(index 0 is the disabled placeholder). No custom listbox to fight.

## 4. Selector strategy

**Prefer role + accessible name / text. Add `data-testid` only where a selector
is genuinely ambiguous.** As verified, the app is already e2e-friendly:

- Landing hero → `page.getByRole("heading", { name: /El puente directo/ })`.
- CTA → `page.getByRole("link", { name: "Ver solicitudes activas" })`.
- Solicitudes title → `page.getByRole("heading", { name: "Solicitudes activas" })`.
- A card → scope by center name: `page.getByText("Hospital J.M. de los Ríos")`
  → `.locator("xpath=ancestor::*[contains(...)]")` is brittle; instead select
  the card's CTA by index or scope via a test id (see below).
- Detail sheet → `page.getByRole("dialog", { name: "Detalle de solicitud" })`.
- Login submit → `getByRole("button", { name: "Enviar código" })`.
- OTP digits → `getByRole("textbox", { name: "Dígito 1" })` … `"Dígito 6"`.
- OTP submit → `getByRole("button", { name: "Verificar" })`.

### `data-testid` to ADD (one component)

`RequestCard` renders the center name (`<h3>`) and the `Ver detalle` link in the
same card, but the list shows multiple cards. To click **the `Ver detalle` of a
specific seeded card** unambiguously, add a stable hook to the card root:

- **Component:** `src/components/ui/request-card.tsx`
- **Change:** add `data-testid="request-card"` and
  `data-center-name={request.centerName}` to the `<Card>` root element.
- **Use in test:**
  ```ts
  const card = page
    .locator('[data-testid="request-card"]')
    .filter({ hasText: "Hospital J.M. de los Ríos" })
    .first();
  await card.getByRole("link", { name: "Ver detalle" }).click();
  ```

> If the implementer prefers zero source changes, an alternative is
> `page.getByRole("link", { name: "Ver detalle" }).first()` plus asserting the
> opened sheet contains a seeded center name. The `data-testid` is the
> recommended, less-flaky path and is the only source edit this spec requires.

### Next.js error-overlay assertion (the whole point)

Server-action crashes surface as the Next dev error overlay or a 500. Because
the webServer runs `pnpm build && pnpm start` (**production** mode), there is no
dev overlay — a crashed action yields a 500 / `error.tsx` boundary instead.
Assert **absence of crash** with a reusable helper:

```ts
// e2e/_helpers.ts
import { expect, type Page } from "@playwright/test";

/** Fail if a Next error boundary / 500 / unhandled-error UI is showing. */
export async function expectNoErrorOverlay(page: Page) {
  // Next prod error boundary + generic crash copy (es + en).
  const crash = page.getByText(
    /Application error|Internal Server Error|something went wrong|Algo salió mal|is not defined/i,
  );
  await expect(crash).toHaveCount(0);
  // Dev overlay portal (belt-and-suspenders if a run uses `next dev`).
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
}
```

Also register a page-level guard so an uncaught client exception fails the test:

```ts
page.on("pageerror", (err) => {
  throw new Error(`Uncaught page error: ${err.message}`);
});
```

## 5. `playwright.config.ts`

```ts
import { defineConfig, devices } from "@playwright/test";

const PORT = 3210;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["list"]]
    : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // ~390px mobile-ish viewport (matches the design target).
    viewport: { width: 390, height: 844 },
    ...devices["iPhone 13"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } }],
  webServer: {
    command: "pnpm build && pnpm start -p 3210",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000, // build + boot; generous.
    stdout: "pipe",
    stderr: "pipe",
  },
});
```

Notes:
- `reuseExistingServer: !CI` → locally, if you already have `pnpm start -p 3210`
  up, Playwright reuses it; in CI it always builds fresh.
- Single `chromium` project, `workers: 1` — the center spec writes to the shared
  DB; serial avoids interleaving.
- `viewport 390×844` is the spec'd mobile width. `devices["iPhone 13"]` provides
  the rest (UA, DPR, touch); the explicit `viewport` override keeps 390 exact.
- `timeout` on `webServer` is 240s to cover a cold `next build`.

### `package.json` scripts (add)

```jsonc
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"     // optional, dev convenience
  }
}
```

Dev dependency: `@playwright/test` (add to `devDependencies`). Install browser
with `npx playwright install --with-deps chromium` (CI does this; locally once).

## 6. `e2e/donor.spec.ts` — ALWAYS-ON (surge-critical)

No auth, no DB writes, runs on every PR. This is the path a donor hits during a
surge; it **must** be green.

```ts
import { test, expect } from "@playwright/test";
import { expectNoErrorOverlay } from "./_helpers";

const SEED_CENTER = "Hospital J.M. de los Ríos"; // seeded; see db/seed.ts

test.describe("donor surge path", () => {
  test.beforeEach(({ page }) => {
    page.on("pageerror", (err) => {
      throw new Error(`Uncaught page error: ${err.message}`);
    });
  });

  test("landing renders hero + CTA", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /El puente directo/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Ver solicitudes activas" }),
    ).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test("solicitudes lists seeded cards", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Ver solicitudes activas" }).click();
    await expect(page).toHaveURL(/\/solicitudes$/);
    await expect(
      page.getByRole("heading", { name: "Solicitudes activas" }),
    ).toBeVisible();
    // At least one seeded center name renders in the list.
    await expect(page.getByText(SEED_CENTER).first()).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test("Ver detalle opens the intercepted detail sheet", async ({ page }) => {
    await page.goto("/solicitudes");
    const card = page
      .locator('[data-testid="request-card"]')
      .filter({ hasText: SEED_CENTER })
      .first();
    await card.getByRole("link", { name: "Ver detalle" }).click();

    const sheet = page.getByRole("dialog", { name: "Detalle de solicitud" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(SEED_CENTER)).toBeVisible();
    await expectNoErrorOverlay(page);
  });
});
```

If the seeded center happens to have no *active* request at run time, the
`SEED_CENTER` assertions degrade gracefully only if data exists — keep the seed
fresh in the CI DB. (See §9 fallback.)

## 7. `e2e/center.spec.ts` — GATED on `TEST_OTP_CODE`

Skips cleanly until the correct OTP is confirmed and added as a secret:

```ts
import { test, expect } from "@playwright/test";
import { expectNoErrorOverlay } from "./_helpers";

const OTP = process.env.TEST_OTP_CODE;
const PHONE = process.env.TEST_CENTER_PHONE ?? "";

test.describe("center auth + registration", () => {
  test.skip(!OTP, "set TEST_OTP_CODE to enable center e2e");
  test.skip(!PHONE, "set TEST_CENTER_PHONE to enable center e2e");

  test.beforeEach(({ page }) => {
    page.on("pageerror", (err) => {
      throw new Error(`Uncaught page error: ${err.message}`);
    });
  });

  async function fillOtp(page: import("@playwright/test").Page) {
    const code = OTP!;
    for (let i = 0; i < 6; i++) {
      await page.getByRole("textbox", { name: `Dígito ${i + 1}` }).fill(code[i]);
    }
    await page.getByRole("button", { name: "Verificar" }).click();
  }

  test("login: phone → OTP → lands on a valid center screen", async ({ page }) => {
    await page.goto("/centro/login");
    await page.getByRole("textbox").first().fill(PHONE); // phone tel input
    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(
      page.getByRole("textbox", { name: "Dígito 1" }),
    ).toBeVisible();
    await fillOtp(page);

    // Success = a real center screen, NOT a crash. Tolerate either the
    // dashboard (approved) or en-revisión (pending).
    await expect(page).toHaveURL(/\/centro(\/en-revision|\/rechazado)?$/);
    await expectNoErrorOverlay(page);
    await expect(
      page.getByRole("heading", {
        name: /(Panel del centro|Estamos verificando tu centro)/,
      }),
    ).toBeVisible();
  });

  test("registration submit invokes the action without crashing", async ({
    page,
  }) => {
    await page.goto("/centro/registro");
    await page.getByRole("button", { name: "Comenzar" }).click();

    await page.getByLabel("Nombre del centro").fill("Centro E2E Smoke");
    await page.getByLabel("Tipo de centro").selectOption({ index: 1 });
    await page.getByLabel("Estado").selectOption({ index: 1 });
    await page.getByLabel("Ciudad").fill("Caracas");
    await page.getByLabel("Dirección").fill("Av. Principal, sector e2e");
    // contact phone (PhoneField) — last tel input on the form:
    await page.getByRole("textbox").filter({ hasText: "" }); // see note below
    await page.locator('input[type="tel"]').last().fill(PHONE);
    await page.getByLabel("Nombre y apellido").fill("Coordinador E2E");

    await page.getByRole("button", { name: "Continuar" }).click();

    // OTP step
    await expect(
      page.getByRole("textbox", { name: "Dígito 1" }),
    ).toBeVisible();
    await fillOtp(page);

    // The POINT: assert the action ran and we landed on a real screen, even on
    // an idempotent re-run where the center already exists.
    await expect(page).toHaveURL(/\/centro(\/en-revision|\/rechazado)?$/);
    await expectNoErrorOverlay(page);
  });
});
```

### Why the registration assertion tolerates idempotency

The registration action **writes to the shared DB**. A second run with the same
`TEST_CENTER_PHONE` cannot create a duplicate — the schema's
**unique-membership index** (one membership per phone/center) rejects it, and
the app **redirects to the center's current status screen** (`/centro/en-revision`
or, if already moved, the dashboard / `rechazado`). That is a **success** for
this test: the assertion's purpose is to catch an **action-invocation crash**
(the `X is not defined` / normalization class), **not** to prove a fresh insert.
So we accept any valid landing URL + `expectNoErrorOverlay`, and require **no
cleanup between runs**.

### Selector note for the contact phone

The datos form has two phone-ish inputs only if the verify phone differs from
the contact phone; in `center-datos-form.tsx` the contact is a `PhoneField`
(`input[type="tel"]`). Using `.locator('input[type="tel"]').last()` targets it.
**If this proves ambiguous in implementation, add `data-testid="contact-phone"`
to `PhoneField`'s `<input>`** (second and final allowable source edit) and
select by it. Remove the dead `getByRole(...).filter` placeholder line above
when implementing — it is illustrative.

## 8. CI — `.github/workflows/e2e.yml`

Mirrors `ci.yml` conventions (pnpm 10, node 22). Separate workflow so it can be
promoted to a **required check** independently.

```yaml
name: e2e

on:
  pull_request:
  push:
    branches: [main]

jobs:
  e2e:
    name: e2e # promote this to a required check once stable
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

      - run: npx playwright install --with-deps chromium

      - run: pnpm test:e2e
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
          POSTGRES_URL_NON_POOLING: ${{ secrets.POSTGRES_URL_NON_POOLING }}
          TEST_CENTER_PHONE: ${{ secrets.TEST_CENTER_PHONE }}
          # If the secret is unset, this resolves to "" and center.spec skips.
          TEST_OTP_CODE: ${{ secrets.TEST_OTP_CODE }}

      - name: Upload Playwright report
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

Notes:
- `webServer` in the config runs `pnpm build && pnpm start` — so CI does **not**
  build separately; Playwright owns server lifecycle. The Supabase + Postgres
  env must be present at **both** build and run time (it is, via `env:` on the
  step).
- With `TEST_OTP_CODE` unset, `center.spec.ts` skips and the job still passes on
  the donor spec — that is the intended pre-confirmation state.
- HTML report uploaded **only on failure** (artifact `playwright-report`).

## 9. Edge cases & fallbacks

- **Seeded center absent in CI DB.** Donor spec depends on at least one active
  request from `Hospital J.M. de los Ríos`. If the CI database is not seeded,
  run `pnpm db:seed` as a step before `pnpm test:e2e`, **or** relax the seed
  assertion to "any `[data-testid=request-card]` exists" + "the opened sheet
  shows the same center name as its card". Prefer keeping the CI DB seeded so we
  test the real, named surface.
- **Intercepted vs full-page detail.** The sheet (`role=dialog`) only appears
  via client-side nav from `/solicitudes`. The test navigates by clicking, never
  by `goto('/solicitudes/{id}')`, so the intercept fires.
- **OTP confirmed later.** When the real `TEST_OTP_CODE` is known, add it as a
  repo secret — no code change; the gate flips automatically on next run.
- **Flake from build time.** `webServer.timeout` is 240s; raise if the CI runner
  is slow. `retries: 1` in CI absorbs transient nav flake.

## 10. Acceptance criteria

- [ ] `pnpm test:e2e` runs `donor.spec.ts` green **locally against a built app**
      (`pnpm build && pnpm start -p 3210` via webServer).
- [ ] `center.spec.ts` **skips cleanly** (3 skipped tests, 0 failed) when
      `TEST_OTP_CODE` is unset.
- [ ] `pnpm lint` and `npx tsc --noEmit` stay green (new files included).
- [ ] `.github/workflows/e2e.yml` runs on PR + push-to-main, uploads the HTML
      report on failure, and the job is named `e2e` (promotable to required).
- [ ] No `.env` / `.vercel` committed; secrets read from env / GH secrets only.
- [ ] At most two source edits, both selector hooks:
      `data-testid="request-card"` (+ `data-center-name`) on `RequestCard`, and
      optionally `data-testid="contact-phone"` on `PhoneField`.

## 11. Files

| Path | Action |
|------|--------|
| `playwright.config.ts` | new |
| `e2e/_helpers.ts` | new |
| `e2e/donor.spec.ts` | new (always-on) |
| `e2e/center.spec.ts` | new (gated) |
| `.github/workflows/e2e.yml` | new |
| `package.json` | add `@playwright/test` dev dep + `test:e2e` script |
| `src/components/ui/request-card.tsx` | add `data-testid="request-card"` + `data-center-name` |
| `src/app/(center)/centro/_components/center-datos-form.tsx` | (optional) `data-testid="contact-phone"` on `PhoneField` |

## 12. Landing it

`feat/e2e` → PR into protected `main`. CI required checks: existing `ci` (lint +
tsc) plus the new `e2e` job. After the donor path is proven stable on a few PRs,
promote `e2e` to a **required** status check. Implement phase sets the Supabase
env + `TEST_CENTER_PHONE` as repo secrets from `.env.local`; `TEST_OTP_CODE` is
left for the user to add to enable the center flows.
