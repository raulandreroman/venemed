import { test, expect } from "@playwright/test";
import { expectNoErrorOverlay } from "./_helpers";

/**
 * Donor surge path — data-INDEPENDENT (no hardcoded seed center, no CI seeding).
 * Runs read-only against whatever active requests exist. The card→page test
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

  test("home renders hero + CTA + the lista feed controls", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: /El puente entre la ayuda/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Crear una lista" }),
    ).toBeVisible();
    // The feed lives on "/" now: search + the sort facet render inline.
    await expect(page.getByRole("searchbox", { name: "Buscar listas" })).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Ordenar listas" }),
    ).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test("/listas permanently redirects to the home feed", async ({ page }) => {
    await page.goto("/listas");
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { name: /El puente entre la ayuda/ }),
    ).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test("unverified centers are labelled and ranked below verified ones", async ({
    page,
  }) => {
    await page.goto("/");
    const cards = page.locator('[data-testid="request-card"]');
    const count = await cards.count();
    test.skip(count === 0, "no active listas available");

    // Data-independent: whatever the mix, the vetted block must come first and
    // every unverified card must carry the label.
    const verified = await cards.evaluateAll((els) =>
      els.map((el) => el.hasAttribute("data-verified")),
    );
    const firstUnverified = verified.indexOf(false);
    if (firstUnverified !== -1) {
      expect(
        verified.slice(firstUnverified).some(Boolean),
        "a verified card must never appear after an unverified one",
      ).toBe(false);
      await expect(
        cards.nth(firstUnverified).getByText("Sin verificar"),
      ).toBeVisible();
      await expect(page.getByText("Sin verificar aún")).toBeVisible();
    }
    await expectNoErrorOverlay(page);
  });

  test("Ver más opens the detail full page matching the card", async ({
    page,
  }) => {
    await page.goto("/");
    const cards = page.locator('[data-testid="request-card"]');
    const count = await cards.count();
    test.skip(count === 0, "no active requests available to open");

    // Every rendered card exposes a non-empty data-center-name (one card per
    // center, enforced by the schema — not something a data-independent spec
    // can prove by count).
    const centerNames = await cards.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-center-name")),
    );
    for (const name of centerNames) {
      expect(name, "card should expose data-center-name").toBeTruthy();
    }
    if (centerNames.length > 1) {
      expect(new Set(centerNames).size).toBe(centerNames.length);
    }

    const card = cards.first();
    const centerName = await card.getAttribute("data-center-name");

    await card.getByRole("link", { name: "Ver más" }).click();

    // Full-page detail (canonical) — a real route, NOT an intercepted sheet.
    await expect(page).toHaveURL(/\/listas\/[^/]+$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const main = page.locator("main");
    // The opened page shows the SAME center as the clicked card.
    await expect(main.getByText(centerName!).first()).toBeVisible();
    // The items section heading renders (active listas always list needs).
    await expect(
      main.getByRole("heading", { name: "Qué necesita el centro" }),
    ).toBeVisible();
    // No leftover countdown/expiry copy from the retired time-window model
    // (the Figma "ventana de 12 h" line is stale — intentionally not shown).
    await expect(
      page.getByText(/vence|ventana|cuenta regresiva/i),
    ).toHaveCount(0);
    await expectNoErrorOverlay(page);
  });
});
