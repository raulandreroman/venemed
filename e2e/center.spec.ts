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

  test("login: phone → OTP → routes to a center screen without crashing", async ({
    page,
  }) => {
    await page.goto("/centro/login");
    await page.getByLabel(/Teléfono/).fill(PHONE);
    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(page.getByRole("textbox", { name: "Dígito 1" })).toBeVisible();
    await fillOtp(page);

    await expect(page).toHaveURL(CENTER_URL);
    await expect(page.getByRole("heading").first()).toBeVisible();
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

    // The POINT: the server action ran and we landed on a real screen — even on
    // an idempotent re-run where the center already exists.
    await expect(page).toHaveURL(CENTER_URL);
    await expectNoErrorOverlay(page);
  });
});
