import { test, expect, type Page } from "@playwright/test";
import { expectNoErrorOverlay } from "./_helpers";
import { hasDbUrl, makeSql, resetSeedCenterReception } from "./_db";

const SEED_CENTER = "Hospital J.M. de los Ríos";

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
    // This test chains login → publish → manage and polls the cached donor list
    // twice (appear + leave); the donor list is unstable_cache(revalidate 60) and
    // revalidateTag(…,"max") is stale-while-revalidate, so the "leaves" poll can
    // run up to the ISR window. Raise the wall-clock budget beyond the default 60s.
    test.setTimeout(240_000);

    const title = `E2E insumos ${Date.now()}`;

    // Re-run resilience: a prior run pauses this center + closes its requests via
    // the kill-switch. Restore the Activa precondition (clear reception_paused_at,
    // reactivate "Insumos pediátricos") so the toggle-OFF step is meaningful again.
    // No-op when the DB isn't reachable/seeded (the spec already skips then).
    if (hasDbUrl()) {
      const sql = makeSql();
      try {
        await resetSeedCenterReception(sql, SEED_CENTER);
      } finally {
        await sql.end({ timeout: 5 });
      }
    }

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

    // open the selector, check a catalog item, and add a custom one by typing a
    // non-matching string into the search and tapping the "Crear «…»" row.
    await page.getByRole("button", { name: "Agregar insumos" }).click();
    await page.getByRole("button", { name: "Guantes quirúrgicos" }).click();
    await page.getByLabel("Buscar insumo").fill("Bisturíes desechables");
    await page
      .getByRole("button", { name: "Crear Bisturíes desechables" })
      .click();
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

    // /centro/solicitudes/<id>/publicada → grab <id> for the detail + manage steps.
    const requestId = new URL(page.url()).pathname.split("/")[3];

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

    // --- Center detail + manage (gotcha #2: drive the REAL extend + finalize
    // actions; build+GET never exercises them). ---
    await page.goto(`/centro/solicitudes/${requestId}`);
    await expect(
      page.getByRole("heading", { name: "Detalle de solicitud" }),
    ).toBeVisible();
    await expect(page.getByText(title).first()).toBeVisible();

    // Extender: re-open the 12/24/48 picker and reset the window from now.
    await page.getByRole("button", { name: "Extender ventana" }).click();
    await page.getByRole("radio", { name: "+12 h" }).click();
    await page.getByRole("button", { name: "Extender", exact: true }).click();
    await page.waitForURL(new RegExp(`/centro/solicitudes/${requestId}$`), {
      timeout: 15_000,
    });
    await expect(page.getByText(/Vence en/).first()).toBeVisible();
    await expectNoErrorOverlay(page);

    // Finalizar: sticky CTA → confirm dialog → real finalizeRequest → /centro.
    await page.getByRole("button", { name: "Finalizar solicitud" }).click();
    await page.getByRole("button", { name: "Finalizar", exact: true }).click();
    await page.waitForURL(/\/centro$/, { timeout: 15_000 });
    await expectNoErrorOverlay(page);

    // Deterministic effect of the REAL finalize action (gotcha #2): the center
    // detail is UNCACHED, so reopening it reflects the DB write immediately —
    // the request now renders its terminal "cumplida" banner and the active-only
    // sticky "Finalizar solicitud" CTA is gone. This proves the action committed
    // status=closed/closedReason=fulfilled, independent of donor-cache timing.
    await page.goto(`/centro/solicitudes/${requestId}`);
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
    // window — re-navigate until the regenerated HTML drops the request.
    await expect
      .poll(
        async () => {
          await page.goto("/solicitudes", { waitUntil: "networkidle" });
          return page.getByText(title).count();
        },
        { timeout: 75_000, intervals: [2000, 3000, 5000, 5000] },
      )
      .toBe(0);

    // --- Center profile + reception kill-switch (slice 4; gotcha #2: drive the
    // REAL switch → Desactivar-recepción sheet → setReception, assert the close-all
    // closes the center's active requests + drops them from the donor list). The
    // seed's "Insumos pediátricos" request is still active for this center. ---
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
    await expect(
      page.getByText("Solicitudes cerradas al pausar"),
    ).toBeVisible();
    await expectNoErrorOverlay(page);

    // …and the center's previously-active request LEFT the donor list (the
    // close-all UPDATE + revalidateTag). Bounded by the ISR window.
    await expect
      .poll(
        async () => {
          await page.goto("/solicitudes", { waitUntil: "networkidle" });
          return page.getByText("Insumos pediátricos").count();
        },
        { timeout: 75_000, intervals: [2000, 3000, 5000, 5000] },
      )
      .toBe(0);
  });

  test("registration submit invokes the action without crashing", async ({
    page,
  }) => {
    await page.goto("/centro/registro");
    await page.getByRole("button", { name: "Comenzar" }).click();

    await page.getByLabel("Nombre del centro").fill("Centro E2E Smoke");
    // "Tipo de centro" is behind NEXT_PUBLIC_FEATURE_CENTER_TYPE (off by default).
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
