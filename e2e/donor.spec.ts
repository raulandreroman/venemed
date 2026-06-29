import { test, expect } from "@playwright/test";
import { expectNoErrorOverlay } from "./_helpers";

const SEED_CENTER = "Hospital J.M. de los Ríos"; // seeded; see src/db/seed.ts

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
