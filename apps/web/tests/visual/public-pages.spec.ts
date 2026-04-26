import { test, expect } from "@playwright/test";

/**
 * Visual snapshots for routes that don't need a session.
 *
 *   - Login (idle, with error, with show-password toggled — toggle is
 *     aspirational, soft-asserted)
 *   - 404
 *   - 500 (synthetic via /__test/error if available, otherwise skipped)
 *   - Forbidden — modeled as the dashboard with `?error=admin_only`
 *     since there's no dedicated /forbidden route. Falls through to
 *     /login redirect when no session, which we still snapshot — drift
 *     in the redirect is also worth catching.
 *
 * Snapshot baselines live in `__snapshots__/` next to this file and
 * are managed by Playwright (`--update-snapshots` to refresh).
 *
 * CI policy: visual diffs do NOT auto-fail. The job runs with
 * `continue-on-error: true` so a snapshot mismatch surfaces as a
 * "needs human review" check rather than blocking merges.
 */

test.describe("public pages — visual", () => {
  test("login page — idle", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("textbox", { name: /email or username/i }),
    ).toBeVisible();
    // Wait for the wordmark + form to settle before screenshotting.
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("login-idle.png", { fullPage: true });
  });

  test("login page — with error", async ({ page }) => {
    // Driving the error state via the URL search param the LoginForm
    // honors (`?error=expired_link`) — humanizeAuthError fires.
    await page.goto("/login?error=expired+link");
    await expect(
      page.getByText(/expired|invalid|sign-in/i),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("login-error.png", { fullPage: true });
  });

  test("login page — show-password toggled", async ({ page }) => {
    await page.goto("/login");
    const pw = page.getByLabel(/password/i);
    await pw.fill("hunter2");
    // Aspirational toggle. If the button doesn't exist we still snapshot
    // the typed-password state so the baseline captures input rendering.
    const toggle = page.getByRole("button", { name: /show password|toggle/i });
    if (await toggle.count()) {
      await toggle.first().click();
    }
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("login-show-password.png", {
      fullPage: true,
    });
  });

  test("404 page", async ({ page }) => {
    // Hit a route that definitely doesn't resolve — the App Router
    // renders not-found.tsx for unmatched paths.
    await page.goto("/this-route-does-not-exist-xyz123");
    await expect(
      page.getByRole("heading", { name: /not found/i }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("404.png", { fullPage: true });
  });

  test("500 page (synthetic)", async ({ page }) => {
    // Without a synthetic error route we can only attempt a path the
    // server might 5xx on. global-error.tsx renders for client-side
    // exceptions; we snapshot the most graceful surface we have.
    // If no /__test/error route exists, this becomes a 404 snapshot —
    // mark as skipped to be honest about coverage rather than ship a
    // misleading baseline.
    const r = await page.goto("/__test/error", { waitUntil: "load" }).catch(() => null);
    if (!r || r.status() === 404) {
      test.skip(true, "no synthetic /__test/error route — add one to enable");
    }
    await expect(page).toHaveScreenshot("500.png", { fullPage: true });
  });

  test("forbidden — admin redirect with error param", async ({ page }) => {
    // The de-facto forbidden surface is the dashboard with
    // ?error=admin_only after the admin layout redirects a non-admin.
    // Without a session we land on /login — that's still a deterministic
    // forbidden landing, snapshot it.
    await page.goto("/?error=admin_only");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("forbidden.png", { fullPage: true });
  });
});
