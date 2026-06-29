import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";

// Load .env.local into the test-runner process so gated specs (center.spec)
// see TEST_OTP_CODE / TEST_CENTER_PHONE and RUN instead of skipping. Next.js
// already loads .env.local for the webServer; the Playwright runner does not.
// dotenv does NOT override vars already in process.env, so CI (which sets these
// as job-level env) is unaffected.
loadEnv({ path: ".env.local" });

const PORT = 3210;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["list"]]
    : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // ~390px mobile-ish viewport (matches the design target).
    viewport: { width: 390, height: 844 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start -p 3210",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000, // build + boot; generous.
    stdout: "pipe",
    stderr: "pipe",
  },
});
