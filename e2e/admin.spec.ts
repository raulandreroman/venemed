import { test, expect, type Page } from "@playwright/test";
import { expectNoErrorOverlay } from "./_helpers";
import {
  ensurePendingCenter,
  getCenter,
  hasDbUrl,
  latestCenterEvent,
  makeAdmin,
  makeSql,
  type Sql,
} from "./_db";
import { clearMailbox, readEmailOtp } from "./_mail";

/**
 * Admin-gating smoke — ALWAYS ON, data-INDEPENDENT (no OTP, no DB writes).
 * Asserts that the (admin) surface is gated by the middleware session check:
 * an anonymous visitor to a gated admin route is redirected to /admin/login.
 * The is_platform_admin authorization itself is covered in server code
 * (requireAdmin()); this guards the regression that lost the redirect.
 */
test.describe("admin gate (unauth)", () => {
  const errors: Error[] = [];
  test.beforeEach(({ page }) => {
    errors.length = 0;
    page.on("pageerror", (e) => errors.push(e));
  });
  test.afterEach(() => {
    expect(errors, errors.map((e) => e.message).join("\n")).toEqual([]);
  });

  test("unauth /admin redirects to the admin login", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(
      page.getByRole("heading", { name: /Ingresa tu correo/ }),
    ).toBeVisible();
    await expect(page.getByText("Acceso de moderador")).toBeVisible();
    await expectNoErrorOverlay(page);
  });

  test("unauth review detail redirects to the admin login", async ({
    page,
  }) => {
    // Arbitrary UUID — must never reach the gated page (redirect happens in
    // middleware before any DB lookup, so this is data-independent).
    await page.goto("/admin/centros/00000000-0000-4000-8000-000000000000");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expectNoErrorOverlay(page);
  });

  test("admin login page is publicly reachable", async ({ page }) => {
    await page.goto("/admin/login");
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(
      page.getByRole("button", { name: "Enviar código" }),
    ).toBeVisible();
    await expectNoErrorOverlay(page);
  });
});

/**
 * Admin moderation actions — GATED, exercises the REAL approve/reject server
 * actions end-to-end (AGENTS.md gotcha #2 / admin-moderation.md §8). Drives the
 * actual submit through the browser, then asserts BOTH the mutated
 * `center.status` AND the matching `moderation_event` row (actor_user_id = the
 * logged-in admin's app_user.id) directly in the DB.
 *
 * Email: uses a DEDICATED admin email (`TEST_ADMIN_EMAIL`) — NOT
 * TEST_CENTER_EMAIL (login) or TEST_CENTER_EMAIL_2 (registration). Those are
 * each already claimed by center.spec; reusing EMAIL_2 would (a) flip that
 * user to is_platform_admin and break the registration routing assertion, and
 * (b) collide on Supabase's per-identity OTP limit. A distinct email dodges the
 * limit. The whole admin flow sends a SINGLE OTP (one login), then approves one
 * center and rejects another.
 *
 * Skips cleanly until `TEST_ADMIN_EMAIL` and a DB URL are set.
 */
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? "";
const ADMIN_ENABLED = !!ADMIN_EMAIL && hasDbUrl();

const APPROVE_CENTER = "Centro E2E Admin · Aprobar";
const REJECT_CENTER = "Centro E2E Admin · Rechazar";

test.describe("admin moderation actions (gated)", () => {
  test.skip(
    !ADMIN_ENABLED,
    "set TEST_ADMIN_EMAIL + POSTGRES_URL to enable admin e2e",
  );

  let sql: Sql;
  let approveId: string;
  let rejectId: string;
  let adminUserId: string;

  const errors: Error[] = [];

  test.beforeAll(async () => {
    if (!ADMIN_ENABLED) return;
    sql = makeSql();
    // Provision two bounded, idempotent pending_review centers to act on.
    approveId = await ensurePendingCenter(sql, APPROVE_CENTER);
    rejectId = await ensurePendingCenter(sql, REJECT_CENTER);
  });

  test.afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
  });

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

  // Single serial test: ONE OTP send → flip admin → approve one, reject another.
  test("login → approve + reject write status + a matching moderation_event", async ({
    page,
  }) => {
    // Heavier than the default 60s budget: email-OTP login (Mailpit poll) +
    // two full moderation round-trips (approve, reject) in one serial flow.
    test.setTimeout(120_000);
    // 1) Admin OTP login (one send for the whole flow).
    await clearMailbox();
    await page.goto("/admin/login");
    await page.getByLabel(/Correo/).fill(ADMIN_EMAIL);
    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(page.getByRole("textbox", { name: "Dígito 1" })).toBeVisible();
    await fillOtp(page, ADMIN_EMAIL);
    // finishLogin redirects to /centro/registro (the email has no membership and
    // is not yet an admin). We MUST wait for that specific destination — a loose
    // /(centro|admin)/ would match the current /admin/login URL immediately and
    // race ahead of finishLogin, so makeAdmin below would find no app_user yet.
    await page.waitForURL(/\/centro\/registro$/, { timeout: 15_000 });

    // 2) Promote this email to a platform admin (app_user now exists post-login).
    adminUserId = await makeAdmin(sql, ADMIN_EMAIL);

    // 3) APPROVE: drive the real sticky-bar action.
    await page.goto(`/admin/centros/${approveId}`);
    await expect(
      page.getByRole("heading", { name: "Revisar centro" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Aprobar" }).click();
    // Assert the REAL outcome (the DB write) rather than the client router.push
    // URL, which is the flaky part — the action's success is the mutation.
    await expect
      .poll(async () => (await getCenter(sql, approveId)).status, {
        timeout: 15_000,
      })
      .toBe("approved");
    await expectNoErrorOverlay(page);

    const approved = await getCenter(sql, approveId);
    expect(approved.status).toBe("approved");
    expect(approved.verified_at).not.toBeNull();
    expect(approved.rejection_reason).toBeNull();

    const approveEvent = await latestCenterEvent(sql, approveId);
    expect(approveEvent?.action).toBe("approved");
    expect(approveEvent?.actor_user_id).toBe(adminUserId);

    // 4) REJECT: open the A4 sheet, pick a motivo, submit the real action.
    await page.goto(`/admin/centros/${rejectId}`);
    await expect(
      page.getByRole("heading", { name: "Revisar centro" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Rechazar" }).click();

    const sheet = page.getByRole("dialog", { name: "Rechazar centro" });
    await expect(sheet).toBeVisible();
    const motivo = sheet.getByRole("button", { name: "Datos incompletos" });
    await motivo.click();
    // Confirm the chip registered before submitting (the submit is gated on it).
    await expect(motivo).toHaveAttribute("aria-pressed", "true");
    await sheet.getByRole("button", { name: "Rechazar y notificar" }).click();
    // Assert the REAL outcome (the DB write), not the flaky client router.push URL.
    await expect
      .poll(async () => (await getCenter(sql, rejectId)).status, {
        timeout: 15_000,
      })
      .toBe("rejected");
    await expectNoErrorOverlay(page);

    const rejected = await getCenter(sql, rejectId);
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejection_reason).toBeTruthy();

    const rejectEvent = await latestCenterEvent(sql, rejectId);
    expect(rejectEvent?.action).toBe("rejected");
    expect(rejectEvent?.actor_user_id).toBe(adminUserId);
    expect(rejectEvent?.reason).toBeTruthy();
  });
});
