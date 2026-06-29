import { expect, type Page } from "@playwright/test";

/** Fail if a Next error boundary / 500 / unhandled-error UI is showing. */
export async function expectNoErrorOverlay(page: Page) {
  // Next prod error boundary + generic crash copy (es + en).
  const crash = page.getByText(
    /Application error|Internal Server Error|something went wrong|Algo salió mal|is not defined/i,
  );
  await expect(crash).toHaveCount(0);
  // Dev overlay portal (belt-and-suspenders if a run uses `next dev`).
  await expect(page.locator("nextjs-portal")).toHaveCount(0);
}
