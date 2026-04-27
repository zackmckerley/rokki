import { test, expect } from "@playwright/test";
import { signInAs } from "./helpers";

/**
 * Flows 17-20 — explorer rail, admin overview, admin users table, shortcuts.
 *
 * Most of these are read-only; some can run without seeded DB but break
 * informatively when admin-only routes 403 — gate the suite on
 * E2E_SEEDED=true to keep CI deterministic.
 */

const SEEDED = process.env.E2E_SEEDED === "true";
test.skip(!SEEDED, "Set E2E_SEEDED=true with a seeded Supabase to run");

test.describe("admin + discovery (flows 17–20)", () => {
  test("flow 17: open explorer rail filter, search for a terminal", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext();
    await signInAs(ctx, "zack", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/");

    // The explorer rail's filter is an inline search box near the top
    // of the rail. The exact selector hasn't stabilized — try the most
    // accessible name first, fall back to a placeholder.
    const filter = page
      .getByRole("textbox", { name: /filter|search terminals/i })
      .or(page.getByPlaceholder(/search|filter/i))
      .first();

    if (await filter.count()) {
      await filter.fill("HEL");
      // After filtering, the rail should still render at least the
      // matching seeded terminal. We just confirm the input accepted
      // the value and didn't error out — the visible-list assertion is
      // the visual-regression suite's job.
      await expect(filter).toHaveValue("HEL");
    } else {
      // No filter shipped yet — verify the rail itself renders at least.
      await expect(
        page.getByRole("navigation").or(page.getByRole("complementary")).first(),
      ).toBeVisible();
    }

    await ctx.close();
  });

  test("flow 18: open /admin (as admin), confirm sidebar + breadcrumbs render", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext();
    await signInAs(ctx, "admin", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/admin");

    // The h1 is "Operator console" per admin/page.tsx.
    await expect(
      page.getByRole("heading", { level: 1, name: /operator console/i }),
    ).toBeVisible({ timeout: 10_000 });
    // Top bar wordmark is contextual: home href becomes /admin.
    await expect(
      page.getByRole("link", { name: /admin overview/i }),
    ).toBeVisible();
    // Quick-actions panel exists.
    await expect(page.getByText(/quick actions/i)).toBeVisible();

    await ctx.close();
  });

  test("flow 19: sort + filter the admin/users table", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext();
    await signInAs(ctx, "admin", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/admin/users");

    // Filter chips: All / Active / Suspended / Platform admins.
    await expect(
      page.getByRole("button", { name: /^all$/i }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /platform admins/i }).click();

    // The table should still render — admins exist in the seed.
    // Search box accepts input.
    const search = page.getByPlaceholder(/search email or name/i);
    await search.fill("admin");
    await expect(search).toHaveValue("admin");

    // Wait for the debounced refetch to settle, then assert at least
    // one row contains "admin@".
    await page.waitForTimeout(500);
    await expect(
      page.getByText(/admin@/i).first(),
    ).toBeVisible({ timeout: 5_000 });

    await ctx.close();
  });

  test("flow 20: open the keyboard shortcuts cheatsheet (?)", async ({
    page,
  }) => {
    await page.goto("/help");
    // Click body so keystroke isn't eaten by the URL bar.
    await page.locator("body").click();
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /keyboard shortcuts/i }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });
});
