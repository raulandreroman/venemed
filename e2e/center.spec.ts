import { test, expect, type Page } from "@playwright/test";
import { expectNoErrorOverlay } from "./_helpers";
import { hasDbUrl, makeSql, resetSeedCenterReception } from "./_db";
import { clearMailbox, readEmailOtp } from "./_mail";

const SEED_CENTER = "Hospital J.M. de los Ríos";

const EMAIL = process.env.TEST_CENTER_EMAIL ?? ""; // login
// Registration uses a SECOND email so its OTP send doesn't collide with the
// login test's send (Supabase rate-limits OTP sends per identity).
const EMAIL_REG = process.env.TEST_CENTER_EMAIL_2 || EMAIL;

// Any post-auth center screen (dashboard / en-revisión / rechazado / registro
// when there is no membership yet). The point of these smokes is that the OTP
// action runs and routes WITHOUT crashing — not a specific destination.
const CENTER_URL = /\/centro(\/(en-revision|rechazado|registro))?$/;

test.describe("center auth + registration", () => {
  test.skip(!EMAIL, "set TEST_CENTER_EMAIL to enable center e2e");

  // Collect uncaught client errors; assert none per test.
  const errors: Error[] = [];
  test.beforeEach(({ page }) => {
    errors.length = 0;
    page.on("pageerror", (e) => errors.push(e));
  });
  test.afterEach(() => {
    expect(errors, errors.map((e) => e.message).join("\n")).toEqual([]);
  });

  async function fillOtp(page: Page, email: string) {
    const code = await readEmailOtp(email);
    for (let i = 0; i < 6; i++) {
      await page.getByRole("textbox", { name: `Dígito ${i + 1}` }).fill(code[i]);
    }
    await page.getByRole("button", { name: "Verificar" }).click();
  }

  async function loginAs(page: Page, email: string) {
    await clearMailbox();
    await page.goto("/centro/login");
    await page.getByLabel(/Correo/).fill(email);
    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(page.getByRole("textbox", { name: "Dígito 1" })).toBeVisible();
    await fillOtp(page, email);
  }

  // The seed (provisionTestMembership) links TEST_CENTER_EMAIL to an APPROVED
  // center that already has an evergreen lista (lista-model-v2: one live lista
  // per center — a partial unique index enforces at most one active/paused row
  // per center_id). This login deterministically lands on the real /centro
  // dashboard (not /centro/registro). This single test does ONE OTP send for
  // TEST_CENTER_EMAIL (registration uses EMAIL_REG) and reuses that one session
  // for the whole publish → manage → reception-pause chain — logging in a
  // second time with the same email would trip the local OTP rate limit
  // ([auth.email] max_frequency) and never reach the OTP screen:
  //
  //   (a) the populated dashboard renders the seeded lista without crashing;
  //   (b) FINALIZE the seed's lista first (so a new one can be created — the
  //       unique-active-per-center index would reject a second insert
  //       otherwise);
  //   (c) publish a NEW lista through the REAL create form + insumo selector
  //       (gotcha #2: build+GET never exercises the action), reaching BOTH the
  //       donor /listas list (cache revalidated) and the center dashboard;
  //   (d) finalize it too, then exercise the reception kill-switch.
  test("login → approved dashboard → publish lista → donor list + dashboard", async ({
    page,
  }) => {
    // This test chains login → finalize → publish → manage and polls the cached
    // donor list twice (appear + leave); the donor list is
    // unstable_cache(revalidate 60) and revalidateTag(…,"max") is
    // stale-while-revalidate, so the "leaves" poll can run up to the ISR window.
    // Raise the wall-clock budget beyond the default 60s.
    test.setTimeout(240_000);

    // itemName stands in for the old per-lista "title" (dropped — lista-model-v2
    // §3d): a unique custom insumo name lets us find THIS run's lista in the
    // donor list / dashboard without a title field to search on.
    const itemName = `E2E insumo ${Date.now()}`;

    // Re-run resilience: a prior run pauses this center + closes its lista via
    // the kill-switch. Restore the Activa precondition (clear
    // reception_paused_at, reactivate the seed lista) so this test starts from
    // a known state on re-runs. No-op when the DB isn't reachable/seeded (the
    // spec already skips then).
    if (hasDbUrl()) {
      const sql = makeSql();
      try {
        await resetSeedCenterReception(sql, SEED_CENTER);
      } finally {
        await sql.end({ timeout: 5 });
      }
    }

    await loginAs(page, EMAIL);

    await page.waitForURL(/\/centro$/, { timeout: 15_000 });
    await expect(page).toHaveURL(CENTER_URL);
    // Center name in the dashboard header (seed: "Hospital J.M. de los Ríos").
    await expect(
      page.getByRole("heading", { name: /Hospital J\.M\. de los Ríos/ }),
    ).toBeVisible();
    // The seeded evergreen lista's own card.
    const seedCard = page.getByTestId("center-request-card").first();
    await expect(seedCard).toBeVisible();
    await expectNoErrorOverlay(page);

    // Finalize the seed lista first — lista-model-v2 allows at most ONE
    // active/paused lista per center, so publishing a new one below requires
    // this one to be terminal first.
    await seedCard.click();
    await page.waitForURL(/\/centro\/lista\/[^/]+$/, { timeout: 15_000 });
    await page.getByRole("button", { name: "Finalizar solicitud" }).click();
    await page.getByRole("button", { name: "Finalizar", exact: true }).click();
    await page.waitForURL(/\/centro$/, { timeout: 15_000 });
    await expectNoErrorOverlay(page);

    await page.goto("/centro/lista/nueva");
    await expect(
      page.getByRole("heading", { name: "Detalle de donación (0)" }),
    ).toBeVisible();

    // open the selector, check a catalog item, and add a custom one by typing a
    // non-matching string into the search and tapping the "Crear «…»" row.
    await page.getByRole("button", { name: "Agregar insumos" }).click();
    await page.getByRole("button", { name: "Guantes quirúrgicos" }).click();
    await page.getByLabel("Buscar insumo").fill(itemName);
    await page.getByRole("button", { name: `Crear ${itemName}` }).click();
    await page.getByRole("button", { name: /Agregar \d+ insumos/ }).click();

    await page
      .getByLabel("Instrucciones de entrega")
      .fill("Entrada principal · Recepción de donaciones");

    await page.getByRole("button", { name: "Publicar solicitud" }).click();

    // The POINT (gotcha #2): the action must actually run, commit + redirect.
    await page.waitForURL(/\/centro\/lista\/[^/]+\/publicada$/, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: "¡Solicitud publicada!" }),
    ).toBeVisible();
    await expectNoErrorOverlay(page);

    // /centro/lista/<id>/publicada → grab <id> for the detail + manage steps.
    const listaId = new URL(page.url()).pathname.split("/")[3];

    // Donor list reflects the publish (active-listas tag revalidated). The
    // list is ISR (stale-while-revalidate), so re-navigate until the
    // regenerated HTML carries the new item.
    await expect
      .poll(
        async () => {
          await page.goto("/listas", { waitUntil: "networkidle" });
          return page.getByText(itemName).count();
        },
        { timeout: 45_000, intervals: [1000, 2000, 3000, 5000] },
      )
      .toBeGreaterThan(0);

    // Center dashboard shows it too.
    await page.goto("/centro");
    await expect(page.getByText(itemName).first()).toBeVisible();
    await expectNoErrorOverlay(page);

    // --- Center detail + manage (gotcha #2: drive the REAL finalize action;
    // build+GET never exercises it). ---
    await page.goto(`/centro/lista/${listaId}`);
    await expect(
      page.getByRole("heading", { name: "Detalle de solicitud" }),
    ).toBeVisible();
    await expect(page.getByText(itemName).first()).toBeVisible();

    // Finalizar: sticky CTA → confirm dialog → real finalizeLista → /centro.
    await page.getByRole("button", { name: "Finalizar solicitud" }).click();
    await page.getByRole("button", { name: "Finalizar", exact: true }).click();
    await page.waitForURL(/\/centro$/, { timeout: 15_000 });
    await expectNoErrorOverlay(page);

    // Deterministic effect of the REAL finalize action (gotcha #2): the center
    // detail is UNCACHED, so reopening it reflects the DB write immediately —
    // the lista now renders its terminal "cumplida" banner and the active-only
    // sticky "Finalizar solicitud" CTA is gone. This proves the action committed
    // status=closed/closedReason=fulfilled, independent of donor-cache timing.
    await page.goto(`/centro/lista/${listaId}`);
    await expect(
      page.getByText(/se marcó como cumplida/i),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Finalizar solicitud" }),
    ).toHaveCount(0);
    await expectNoErrorOverlay(page);

    // …and it LEAVES the donor active list. The list is cached
    // (unstable_cache, revalidate 60) and revalidateTag(…,"max") is
    // stale-while-revalidate, so eventual consistency is bounded by the ISR
    // window — re-navigate until the regenerated HTML drops the item.
    await expect
      .poll(
        async () => {
          await page.goto("/listas", { waitUntil: "networkidle" });
          return page.getByText(itemName).count();
        },
        { timeout: 75_000, intervals: [2000, 3000, 5000, 5000] },
      )
      .toBe(0);

    // --- Center profile + reception kill-switch (gotcha #2: drive the REAL
    // switch → Desactivar-recepción sheet → setReception). Both this center's
    // listas are already terminal at this point, so this exercises the toggle
    // mechanics themselves (the close-all effect on a still-active lista is
    // covered by the finalize assertions above). ---
    await page.goto("/centro/perfil");
    await expect(
      page.getByRole("heading", { name: /Hospital J\.M\. de los Ríos/ }),
    ).toBeVisible();
    await expect(page.getByText("Verificado")).toBeVisible();

    // Toggle OFF → confirm → real setReception(true).
    await page
      .getByRole("switch", { name: "Recepción de donaciones" })
      .click();
    await page.getByRole("button", { name: "Desactivar", exact: true }).click();
    await page.waitForURL(/\/centro\/perfil$/, { timeout: 15_000 });

    // Profile/dashboard queries are uncached → the pause shows immediately.
    await expect(page.getByText(/Pausada/)).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test("registration submit invokes the action without crashing", async ({
    page,
  }) => {
    await clearMailbox();
    await page.goto("/centro/registro");
    await page.getByRole("button", { name: "Comenzar" }).click();

    await page.getByLabel("Nombre del centro").fill("Centro E2E Smoke");
    // "Tipo de centro" is behind NEXT_PUBLIC_FEATURE_CENTER_TYPE (off by default).
    await page.getByLabel("Estado").selectOption({ index: 1 });
    await page.getByLabel("Ciudad").fill("Caracas");
    await page.getByLabel("Dirección").fill("Av. Principal, sector e2e");
    await page.getByLabel("Nombre y apellido").fill("Coordinador E2E");
    // Email is the login identity (OTP target); the contact phone is optional.
    await page.getByLabel("Correo electrónico").fill(EMAIL_REG);

    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByRole("textbox", { name: "Dígito 1" })).toBeVisible();
    await fillOtp(page, EMAIL_REG);

    // The POINT: wait for the server action to actually COMPLETE and redirect
    // us OFF the wizard (`/centro/registro`) to a post-registration status
    // screen. Asserting CENTER_URL alone would pass instantly because the
    // wizard already lives at `/centro/registro` — tearing down the page before
    // the async action runs and silently aborting the DB write (AGENTS.md
    // gotcha #2). A fresh center lands on en-revisión (pending_review); an
    // idempotent re-run routes by existing status (en-revisión / rechazado /
    // dashboard) — all leave the wizard.
    await page.waitForURL(/\/centro(\/(en-revision|rechazado))?$/, {
      timeout: 15_000,
    });
    await expect(page).toHaveURL(CENTER_URL);
    await expectNoErrorOverlay(page);
  });
});
