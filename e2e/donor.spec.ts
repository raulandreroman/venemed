import { test, expect } from "@playwright/test";
import { expectNoErrorOverlay } from "./_helpers";

/**
 * Donor surge path — data-INDEPENDENT (no hardcoded seed center, no CI seeding).
 * Runs read-only against whatever active requests exist. The card→sheet test
 * skips gracefully if the list is empty (e.g. all seed requests have expired).
 * NOTE: a dedicated/seeded test DB is the proper long-term fix (see e2e spec).
 */
test.describe("donor surge path", () => {
  // Collect uncaught client errors; assert none per test. (Throwing inside a
  // page.on handler doesn't reliably fail the test it occurred in.)
  const errors: Error[] = [];
  test.beforeEach(({ page }) => {
    errors.length = 0;
    page.on("pageerror", (e) => errors.push(e));
  });
  test.afterEach(() => {
    expect(errors, errors.map((e) => e.message).join("\n")).toEqual([]);
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

  test("solicitudes list renders", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Ver solicitudes activas" }).click();
    await expect(page).toHaveURL(/\/listas$/);
    await expect(
      page.getByRole("heading", { name: "Solicitudes activas" }),
    ).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test("Ver detalle opens the intercepted sheet matching the card", async ({
    page,
  }) => {
    await page.goto("/listas");
    const cards = page.locator('[data-testid="request-card"]');
    const count = await cards.count();
    test.skip(count === 0, "no active requests available to open");

    const card = cards.first();
    const centerName = await card.getAttribute("data-center-name");
    expect(centerName, "card should expose data-center-name").toBeTruthy();

    await card.getByRole("link", { name: "Ver detalle" }).click();

    const sheet = page.getByRole("dialog", { name: "Detalle de solicitud" });
    await expect(sheet).toBeVisible();
    // The opened sheet shows the SAME center as the clicked card.
    await expect(sheet.getByText(centerName!).first()).toBeVisible();
    await expectNoErrorOverlay(page);
  });
});
