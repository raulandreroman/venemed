import { test, expect, type Page } from "@playwright/test";
import { expectNoErrorOverlay } from "./_helpers";

const OTP = process.env.TEST_OTP_CODE;
const PHONE = process.env.TEST_CENTER_PHONE ?? "";

test.describe("center auth + registration", () => {
  // Skips cleanly until the correct OTP is confirmed and added as a secret.
  test.skip(!OTP, "set TEST_OTP_CODE to enable center e2e");
  test.skip(!PHONE, "set TEST_CENTER_PHONE to enable center e2e");

  test.beforeEach(({ page }) => {
    page.on("pageerror", (err) => {
      throw new Error(`Uncaught page error: ${err.message}`);
    });
  });

  async function fillOtp(page: Page) {
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
    await expect(page.getByRole("textbox", { name: "Dígito 1" })).toBeVisible();
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
    // contact phone (PhoneField) — the last tel input on the form:
    await page.locator('input[type="tel"]').last().fill(PHONE);
    await page.getByLabel("Nombre y apellido").fill("Coordinador E2E");

    await page.getByRole("button", { name: "Continuar" }).click();

    // OTP step
    await expect(page.getByRole("textbox", { name: "Dígito 1" })).toBeVisible();
    await fillOtp(page);

    // The POINT: assert the action ran and we landed on a real screen, even on
    // an idempotent re-run where the center already exists.
    await expect(page).toHaveURL(/\/centro(\/en-revision|\/rechazado)?$/);
    await expectNoErrorOverlay(page);
  });
});
