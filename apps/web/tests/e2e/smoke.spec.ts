import { test, expect } from "@playwright/test";

/**
 * Smoke: the login page renders, has an email input, and accepts input.
 * No actual Supabase round-trip — that's in `acceptance.spec.ts`.
 */

test.describe("public pages", () => {
  test("login renders", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /email/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /send sign-in link/i }),
    ).toBeVisible();
  });

  test("help is public-reachable", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /help & keyboard shortcuts/i,
    );
  });

  test("? overlay opens from help page", async ({ page }) => {
    await page.goto("/help");
    await page.keyboard.press("Shift+Slash");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("rate limit responds 429 after 6 rapid requests", async ({ request }) => {
    const email = `e2e-rate-${Date.now()}@example.com`;
    const url = "/api/v1/auth/send-link";
    // Burst past the 5/min cap for a fresh email.
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await request.post(url, { data: { email } });
      codes.push(r.status());
    }
    // At least one of those should be 429; earlier successful ones can be
    // 200 or 502 (if SMTP isn't wired in test), but one must be rate-limited.
    expect(codes).toContain(429);
  });
});
