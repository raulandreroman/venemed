import { test, expect, type Page } from "@playwright/test";
import { expectNoErrorOverlay } from "./_helpers";
import { hasDbUrl, makeSql, ensureInviteeUnattached } from "./_db";
import { clearMailbox, readEmailOtp } from "./_mail";

const SEED_CENTER = "Hospital J.M. de los Ríos";

// Responsable of the seeded, approved center (provisionTestMembership links
// this email as center_admin). A DIFFERENT, dedicated email is used as the
// invitee (see .env.example) — TEST_CENTER_EMAIL_2 already gets a membership
// via center.spec.ts's registration test, which would trip the
// one-center-per-user unique index if reused here.
const EMAIL = process.env.TEST_CENTER_EMAIL ?? "";
const INVITEE_EMAIL = process.env.TEST_CENTER_EMAIL_3 ?? "";

test.describe("center team invitations", () => {
  test.skip(
    !EMAIL || !INVITEE_EMAIL,
    "set TEST_CENTER_EMAIL and TEST_CENTER_EMAIL_3 to enable team e2e",
  );

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

  test("Responsable invites by link → invitee joins by email → appears as Operador", async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);

    if (hasDbUrl()) {
      const sql = makeSql();
      try {
        await ensureInviteeUnattached(sql, INVITEE_EMAIL, SEED_CENTER);
      } finally {
        await sql.end({ timeout: 5 });
      }
    }

    // --- Responsable creates the invite link ---------------------------
    await loginAs(page, EMAIL);
    await page.waitForURL(/\/centro$/, { timeout: 15_000 });

    await page.getByRole("button", { name: "Más opciones" }).click();
    await page.getByRole("menuitem", { name: "Ajustes" }).click();
    await page.waitForURL(/\/centro\/perfil$/, { timeout: 15_000 });

    await page.getByRole("link", { name: "Miembros del equipo" }).click();
    await page.waitForURL(/\/centro\/equipo$/, { timeout: 15_000 });
    await expect(page.getByText(/de 5 miembros/)).toBeVisible();
    await expectNoErrorOverlay(page);

    await page.getByRole("button", { name: "+ Invitar a alguien" }).click();
    await expect(
      page.getByRole("heading", { name: "Invitar a alguien" }),
    ).toBeVisible();
    await page.getByLabel("Nombre (opcional)").fill("E2E Operador");
    await page
      .getByRole("button", { name: "Crear enlace de invitación" })
      .click();

    await expect(
      page.getByRole("heading", { name: "Enlace de invitación listo" }),
    ).toBeVisible();

    // The raw token only ever appears in this read-only field — grab it here.
    const urlField = page.getByTestId("invite-url");
    await expect(urlField).toBeVisible();
    const inviteUrl = (await urlField.textContent())?.trim();
    expect(inviteUrl).toBeTruthy();
    // Dismiss the sheet — the "Listo" button was removed; Escape closes it
    // (and still triggers the team-list refresh via close()).
    await page.keyboard.press("Escape");

    // --- Invitee opens the link in a separate browser context ----------
    const inviteeContext = await browser.newContext();
    const inviteePage = await inviteeContext.newPage();
    const inviteeErrors: Error[] = [];
    inviteePage.on("pageerror", (e) => inviteeErrors.push(e));

    try {
      await clearMailbox();
      await inviteePage.goto(inviteUrl!);
      await expect(
        inviteePage.getByRole("heading", { name: /te invitó a unirte/ }),
      ).toBeVisible();
      await expect(
        inviteePage.getByText(/te agregó como Operador/),
      ).toBeVisible();

      await inviteePage.getByLabel("Correo electrónico").fill(INVITEE_EMAIL);
      await inviteePage.getByRole("button", { name: "Continuar" }).click();
      await expect(
        inviteePage.getByRole("textbox", { name: "Dígito 1" }),
      ).toBeVisible();
      await fillOtp(inviteePage, INVITEE_EMAIL);

      await inviteePage.waitForURL(/\/centro$/, { timeout: 20_000 });
      await expect(
        inviteePage.getByText("Estás en modo Operador"),
      ).toBeVisible();
      await expectNoErrorOverlay(inviteePage);
      expect(
        inviteeErrors,
        inviteeErrors.map((e) => e.message).join("\n"),
      ).toEqual([]);
    } finally {
      await inviteeContext.close();
    }

    // --- Back as the Responsable: the invitee shows up as Operador ------
    await page.goto("/centro/equipo");
    await expect(page.getByText("E2E Operador")).toBeVisible();
    await expect(page.getByText("Operador", { exact: true })).toBeVisible();
    // The pending invite was consumed.
    await expect(page.getByText("Invitaciones pendientes")).toHaveCount(0);
    await expectNoErrorOverlay(page);

    // --- Responsable removes the Operador -------------------------------
    await page
      .getByRole("button", { name: /Quitar a E2E Operador/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "¿Quitar a E2E Operador?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Quitar", exact: true }).click();
    await expect(page.getByText("E2E Operador")).toHaveCount(0);
    await expectNoErrorOverlay(page);
  });
});
