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
  // for the whole edit → publish → reconfirm → reception-pause chain — logging
  // in a second time with the same email would trip the local OTP rate limit
  // ([auth.email] max_frequency) and never reach the OTP screen:
  //
  //   (a) the populated dashboard v2 renders the seeded lista's sections
  //       without crashing;
  //   (b) EDIT it (the upsert model: publishing again replaces the same
  //       evergreen row's fields/items — no finalize-first step needed) via
  //       the REAL editor + insumo selector + urgency-edit + aviso de exceso
  //       (gotcha #2: build+GET never exercises the action), reaching BOTH the
  //       donor /listas list (cache revalidated) and the center dashboard;
  //   (c) reconfirm a backdated-stale lista via the freshness card's real
  //       `confirmVigente` action;
  //   (d) exercise the reception kill-switch.
  test("login → approved dashboard → edit lista → donor list + dashboard", async ({
    page,
  }) => {
    // This test chains login → edit → reconfirm → reception-pause and polls
    // the cached donor list; the donor list is unstable_cache(revalidate 60)
    // and revalidateTag(…,"max") is stale-while-revalidate, so the poll can
    // run up to the ISR window. Raise the wall-clock budget beyond the
    // default 60s.
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
    // A seeded section item (seed: an urgent need on this center's lista).
    await expect(page.getByText("Jeringas estériles")).toBeVisible();
    await expectNoErrorOverlay(page);

    // "Editar lista" (sticky footer) → the editor, pre-filled from the
    // existing evergreen lista.
    await page.getByRole("link", { name: "Editar lista" }).click();
    await page.waitForURL(/\/centro\/lista\/editar$/, { timeout: 15_000 });
    await expect(page.getByText("Acetaminofén 500 mg")).toBeVisible();

    // open the selector, check a catalog item, and add a custom one by typing a
    // non-matching string into the search and tapping the "Crear «…»" row.
    await page.getByRole("button", { name: "Agregar insumos" }).click();
    await page.getByRole("button", { name: "Guantes quirúrgicos estériles" }).click();
    await page.getByLabel("Buscar insumo").fill(itemName);
    await page.getByRole("button", { name: `Crear ${itemName}` }).click();
    await page.getByRole("button", { name: /Agregar \d+ insumos?/ }).click();

    // Mark the new custom item as urgent via the A2 accordion row: expand the
    // row, flip the per-item "Urgente" switch, collapse.
    await page.getByRole("button", { name: itemName, exact: true }).click();
    const urgentSwitch = page.getByRole("switch", { name: `Urgente: ${itemName}` });
    await urgentSwitch.click();
    await expect(urgentSwitch).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: itemName, exact: true }).click();

    await page
      .getByLabel("Nota para los donantes")
      .fill("Entrada principal · Recepción de donaciones");

    // Reception name is now required (#102 C1) — fill it before advancing, or
    // "Siguiente" blocks with "Agrega el nombre de quien recibe."
    await page.getByLabel("Quién recibe").fill("María Pérez");

    await page.getByRole("button", { name: "Siguiente" }).click();

    // Step 2: aviso de exceso — create one with a new excess item + a razón.
    await page.getByRole("button", { name: "Crear aviso de exceso" }).click();
    await page.getByRole("button", { name: "Agregar insumos" }).click();
    await page.getByRole("button", { name: "Sábanas clínicas" }).click();
    await page.getByRole("button", { name: /Agregar \d+ insumos?/ }).click();
    await page.getByLabel("Razón del aviso de exceso").fill("Depósito lleno.");
    await page.getByRole("button", { name: "Publicar aviso" }).click();

    // The POINT (gotcha #2): the action must actually run, commit + redirect.
    await page.waitForURL(/\/centro\/lista\/[^/]+\/publicada$/, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: "¡Lista publicada!" }),
    ).toBeVisible();
    await expectNoErrorOverlay(page);

    // /centro/lista/<id>/publicada → grab <id> for the reconfirm step below.
    const listaId = new URL(page.url()).pathname.split("/")[3];

    // Donor list reflects the edit (active-listas tag revalidated). The
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

    // Center dashboard shows it too, under "Urgente" (marked urgent above).
    await page.goto("/centro");
    await expect(page.getByText(itemName).first()).toBeVisible();
    await expectNoErrorOverlay(page);

    // --- Freshness / reconfirm (gotcha #2: drive the REAL confirmVigente
    // action). Backdate updated_at via SQL so the card is deterministic. ---
    if (hasDbUrl()) {
      const sql = makeSql();
      try {
        await sql`update "lista" set updated_at = now() - interval '5 days' where id = ${listaId}`;
      } finally {
        await sql.end({ timeout: 5 });
      }

      await page.goto("/centro");
      await expect(page.getByText(/Confirma que sigue vigente/)).toBeVisible();
      await page.getByRole("button", { name: "Sí, sigue vigente" }).click();
      await expect(page.getByText(/Confirma que sigue vigente/)).toHaveCount(0);
      await expectNoErrorOverlay(page);
    }

    // --- Center profile + reception kill-switch (gotcha #2: drive the REAL
    // switch → Desactivar-recepción sheet → setReception). ---
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

    // …and the lista LEAVES the donor active list (setReception(true) closes
    // it). The list is cached (unstable_cache, revalidate 60) and
    // revalidateTag(…,"max") is stale-while-revalidate, so eventual
    // consistency is bounded by the ISR window.
    await expect
      .poll(
        async () => {
          await page.goto("/listas", { waitUntil: "networkidle" });
          return page.getByText(itemName).count();
        },
        { timeout: 75_000, intervals: [2000, 3000, 5000, 5000] },
      )
      .toBe(0);
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
    // WhatsApp contact phone is now REQUIRED (#102 Part A) — the form won't
    // submit (and the OTP step never renders) without it.
    await page.getByLabel("Teléfono de contacto (WhatsApp)").fill("04121234567");
    // Email is the login identity (OTP target).
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
