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
  // the real /centro dashboard (not /centro/registro). One OTP send for this
  // number (registration uses PHONE_REG) to stay clear of the OTP rate limit
  // (gotcha #8). Asserts the populated dashboard renders without crashing.
  test("login: phone → OTP → approved center dashboard (name + a request)", async ({
    page,
  }) => {
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
