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
      page.getByRole("heading", { name: /Ingresa tu teléfono/ }),
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
 * Phone: uses a DEDICATED admin number (`TEST_ADMIN_PHONE`) — NOT
 * TEST_CENTER_PHONE (login) or TEST_CENTER_PHONE_2 (registration). Those are
 * each already claimed by center.spec; reusing PHONE_2 would (a) flip that
 * user to is_platform_admin and break the registration routing assertion, and
 * (b) collide on Supabase's ~1/min per-number OTP limit. A distinct number
 * dodges the limit exactly as gotcha #8 prescribes. The whole admin flow sends
 * a SINGLE OTP (one login), then approves one center and rejects another.
 *
 * Skips cleanly until `TEST_OTP_CODE`, `TEST_ADMIN_PHONE`, and a DB URL are set.
 */
const OTP = process.env.TEST_OTP_CODE;
const ADMIN_PHONE = process.env.TEST_ADMIN_PHONE ?? "";
const ADMIN_E164 = `+58${ADMIN_PHONE.replace(/\D/g, "")}`;
const ADMIN_ENABLED = !!OTP && !!ADMIN_PHONE && hasDbUrl();

const APPROVE_CENTER = "Centro E2E Admin · Aprobar";
const REJECT_CENTER = "Centro E2E Admin · Rechazar";

test.describe("admin moderation actions (gated)", () => {
  test.skip(
    !ADMIN_ENABLED,
    "set TEST_OTP_CODE + TEST_ADMIN_PHONE + POSTGRES_URL to enable admin e2e",
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

  async function fillOtp(page: Page) {
    const code = OTP!;
    for (let i = 0; i < 6; i++) {
      await page.getByRole("textbox", { name: `Dígito ${i + 1}` }).fill(code[i]);
    }
    await page.getByRole("button", { name: "Verificar" }).click();
  }

  // Single serial test: ONE OTP send → flip admin → approve one, reject another.
  test("login → approve + reject write status + a matching moderation_event", async ({
    page,
  }) => {
    // 1) Admin OTP login (one send for the whole flow).
    await page.goto("/admin/login");
    await page.getByLabel(/Teléfono/).fill(ADMIN_PHONE);
    await page.getByRole("button", { name: "Enviar código" }).click();
    await expect(page.getByRole("textbox", { name: "Dígito 1" })).toBeVisible();
    await fillOtp(page);
    // finishLogin redirects somewhere real (the number has no membership and is
    // not yet an admin → /centro/registro). The destination is irrelevant; the
    // point is that the session cookie is now set and app_user exists.
    await page.waitForURL(/\/(centro|admin)/);

    // 2) Promote this phone to a platform admin (app_user now exists post-login).
    adminUserId = await makeAdmin(sql, ADMIN_E164);

    // 3) APPROVE: drive the real sticky-bar action.
    await page.goto(`/admin/centros/${approveId}`);
    await expect(
      page.getByRole("heading", { name: "Revisar centro" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Aprobar" }).click();
    await page.waitForURL(/\/admin\?.*done=approved/);
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
    await sheet.getByRole("button", { name: "Datos incompletos" }).click();
    await sheet.getByRole("button", { name: "Rechazar y notificar" }).click();
    await page.waitForURL(/\/admin\?.*done=rejected/);
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
