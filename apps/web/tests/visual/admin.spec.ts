import { test, expect } from "@playwright/test";
import { signInAs } from "../e2e/helpers";

/**
 * Visual snapshots for admin surfaces.
 *
 * Gated on E2E_SEEDED=true and a seeded admin user. CI does not block
 * on visual diff failures.
 */

const SEEDED = process.env.E2E_SEEDED === "true";
test.skip(!SEEDED, "Set E2E_SEEDED=true with a seeded Supabase to run");

test.describe("admin — visual", () => {
  test("admin overview", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await signInAs(ctx, "admin", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { level: 1, name: /operator console/i }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("admin-overview.png", {
      fullPage: true,
      // Mask the live counts and last-seen timestamps so the baseline
      // doesn't drift every run.
      mask: [
        page.locator("span.font-mono.text-2xl"), // KPI numerals
        page.locator("span.text-\\[10px\\].text-text-3"), // last-seen
      ],
    });
    await ctx.close();
  });

  test("admin users table", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await signInAs(ctx, "admin", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/admin/users");
    await expect(
      page.getByRole("button", { name: /^all$/i }),
    ).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("admin-users.png", {
      fullPage: true,
      // Mask volatile bits (last-sign-in timestamps, user IDs).
      mask: [
        page.locator("span.font-mono"),
      ],
    });
    await ctx.close();
  });
});
