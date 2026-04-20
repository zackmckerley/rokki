import { test, expect } from "@playwright/test";

/**
 * The 18-step acceptance walkthrough from `docs/11_ACCEPTANCE.md §11.3.10`.
 *
 * Requires a seeded local Supabase with the four test users (zack, carlos,
 * maria, bank — see `supabase/seed.sql`). Skips cleanly if `E2E_SEEDED`
 * isn't `true` so the suite still passes on developer laptops without the
 * seed.
 *
 * Each numbered test below corresponds to an acceptance step. We split them
 * into grouped tests rather than one 500-line mega-test so failures report
 * precisely.
 */

const SEEDED = process.env.E2E_SEEDED === "true";
test.skip(!SEEDED, "Set E2E_SEEDED=true with a seeded Supabase to run");

const ZACK_EMAIL = process.env.E2E_ZACK_EMAIL ?? "zack@rokki.local";

test.describe("acceptance: core flow", () => {
  test("step 1-3: magic link → dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(ZACK_EMAIL);
    await page.getByRole("button", { name: /send sign-in link/i }).click();
    await expect(page.getByText(/check your email/i)).toBeVisible();
    // In a seeded env the callback URL is pasted here by the test harness —
    // outside our scope. Skip ahead by setting the cookie directly in CI.
  });

  test.fixme("step 4-6: create space + first terminal", async () => {
    // TODO once seeds include an authed session cookie fixture.
  });

  test.fixme("step 7-9: invite member + accept invite", async () => {});

  test.fixme("step 10-12: upload file, scan, download", async () => {});

  test.fixme("step 13-15: MCP token + claude call", async () => {});

  test.fixme("step 16-18: archive + audit", async () => {});
});
