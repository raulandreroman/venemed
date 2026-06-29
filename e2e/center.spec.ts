import { test, expect, type Page } from "@playwright/test";
import { expectNoErrorOverlay } from "./_helpers";

const OTP = process.env.TEST_OTP_CODE;
const PHONE = process.env.TEST_CENTER_PHONE ?? ""; // login
// Registration uses a SECOND number so its OTP send doesn't collide with the
// login test's send (Supabase rate-limits OTP to ~1/min per number).
const PHONE_REG = process.env.TEST_CENTER_PHONE_2 || PHONE;

// Any post-auth center screen (dashboard / en-revisión / rechazado / registro
// when there is no membership yet). The point of these smokes is that the OTP
// action runs and routes WITHOUT crashing — not a specific destination.
const CENTER_URL = /\/centro(\/(en-revision|rechazado|registro))?$/;

test.describe("center auth + registration", () => {
  test.skip(!OTP, "set TEST_OTP_CODE to enable center e2e");
  test.skip(!PHONE, "set TEST_CENTER_PHONE to enable center e2e");

  // Collect uncaught client errors; assert none per test.
  const errors: Error[] = [];
  test.beforeEach(({ page }) => {
    errors.length = 0;
    page.on("pageerror", (e) => errors.push(e));
  });
  test.afterEach(() => {
    expect(errors, errors.map((e) => e.message).join("\n")).toEqual([]);
  });

  async function fillOtp(page: Page) {
    const code = OTP!;
    for (let i = 0; i < 6; i++) {
      await page.getByRole("textbox", { name: `Dígito ${i + 1}` }).fill(code[i]);
    }
    await page.getByRole("button", { name: "Verificar" }).click();
  }

  async function loginAs(page: Page, phone: string) {
    await page.goto("/centro/login");
    await page.getByLabel(/Teléfono/).fill(phone);
    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(page.getByRole("textbox", { name: "Dígito 1" })).toBeVisible();
    await fillOtp(page);
  }

  // The seed (provisionTestMembership) links TEST_CENTER_PHONE to an APPROVED
  // center that has an active request, so this login deterministically lands on
  // the real /centro dashboard (not /centro/registro). This single test does
  // ONE OTP send for TEST_CENTER_PHONE (registration uses PHONE_REG) and reuses
  // that one session to also exercise the slice-2 publish flow — logging in a
  // second time with the same number would trip the local OTP rate limit
  // ([auth.sms] max_frequency, gotcha #8) and never reach the OTP screen.
  //
  // It asserts: (a) the populated dashboard renders without crashing, then
  // (b) publishing a request through the REAL create form + insumo selector
  // (gotcha #2: build+GET never exercises the action) reaches BOTH the donor
  // /solicitudes list (cache revalidated) and the center dashboard.
  test("login → approved dashboard → publish solicitud → donor list + dashboard", async ({
    page,
  }) => {
    const title = `E2E insumos ${Date.now()}`;

    await loginAs(page, PHONE);

    await page.waitForURL(/\/centro$/, { timeout: 15_000 });
    await expect(page).toHaveURL(CENTER_URL);
    // Center name in the dashboard header (seed: "Hospital J.M. de los Ríos").
    await expect(
      page.getByRole("heading", { name: /Hospital J\.M\. de los Ríos/ }),
    ).toBeVisible();
    // At least one of the center's own request cards.
    await expect(page.getByTestId("center-request-card").first()).toBeVisible();
    await expectNoErrorOverlay(page);

    await page.goto("/centro/solicitudes/nueva");
    await expect(
      page.getByRole("heading", { name: "Título de la solicitud" }),
    ).toBeVisible();

    await page.getByLabel("Título de la solicitud").fill(title);
    await page.getByRole("button", { name: "Quirófano" }).click();

    // open the selector, check a catalog item + add a custom one
    await page.getByRole("button", { name: "Agregar insumos" }).click();
    await page.getByRole("button", { name: "Guantes quirúrgicos" }).click();
    await page.getByRole("button", { name: "Otro insumo (escríbelo)" }).click();
    await page.getByLabel("Otro insumo").fill("Bisturíes desechables");
    await page.getByRole("button", { name: "Añadir" }).click();
    await page.getByRole("button", { name: /Agregar \d+ insumos/ }).click();

    await page.getByRole("radio", { name: "48 h" }).click();
    await page
      .getByLabel("Instrucciones de entrega")
      .fill("Entrada principal · Recepción de donaciones");

    await page.getByRole("button", { name: "Publicar solicitud" }).click();

    // The POINT (gotcha #2): the action must actually run, commit + redirect.
    await page.waitForURL(/\/centro\/solicitudes\/[^/]+\/publicada$/, {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: "¡Solicitud publicada!" }),
    ).toBeVisible();
    await expectNoErrorOverlay(page);

    // Donor list reflects the publish (active-requests tag revalidated). The
    // list is ISR (stale-while-revalidate), so re-navigate until the
    // regenerated HTML carries the new request.
    await expect
      .poll(
        async () => {
          await page.goto("/solicitudes", { waitUntil: "networkidle" });
          return page.getByText(title).count();
        },
        { timeout: 45_000, intervals: [1000, 2000, 3000, 5000] },
      )
      .toBeGreaterThan(0);

    // Center dashboard shows it too.
    await page.goto("/centro");
    await expect(page.getByText(title).first()).toBeVisible();
    await expectNoErrorOverlay(page);
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
    await page.locator('input[type="tel"]').last().fill(PHONE_REG); // contact phone
    await page.getByLabel("Nombre y apellido").fill("Coordinador E2E");

    await page.getByRole("button", { name: "Continuar" }).click();

    await expect(page.getByRole("textbox", { name: "Dígito 1" })).toBeVisible();
    await fillOtp(page);

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
