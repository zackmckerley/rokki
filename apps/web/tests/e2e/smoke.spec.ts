import { test, expect } from "@playwright/test";

/**
 * Smoke: the login page renders, has an email/username + password input,
 * and accepts input. No actual Supabase round-trip — that's in
 * `acceptance.spec.ts`.
 *
 * Magic-link sign-in was removed (closed system, admins provision
 * accounts). The form is now password-only.
 */

test.describe("public pages", () => {
  test("login renders", async ({ page }) => {
    await page.goto("/login");
    // The wordmark is the brand mark (no h1 wraps it). Check it by
    // accessible name.
    await expect(page.getByLabel("Rokki").first()).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /email or username/i }),
    ).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^sign in$/i }),
    ).toBeVisible();
  });

  test("help is public-reachable", async ({ page }) => {
    await page.goto("/help");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      /help/i,
    );
  });

  test("? overlay opens from help page", async ({ page }) => {
    await page.goto("/help");
    // Click the page first so keyboard events go to it (not the URL bar).
    await page.locator("body").click();
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("send-link endpoint returns 410 Gone (magic-link removed)", async ({
    request,
  }) => {
    // The endpoint was deliberately disabled (closed-system policy).
    // Anything other than 410 means the disabling regressed.
    const r = await request.post("/api/v1/auth/send-link", {
      data: { email: `e2e-${Date.now()}@example.com` },
    });
    expect(r.status()).toBe(410);
  });

  test("password-login rate-limits after 11 rapid requests", async ({
    request,
  }) => {
    // Same shape as the old send-link rate-limit test, just pointed at
    // the password-login endpoint that's now the only auth path.
    // 10/10min per (IP, email) — the 11th must 429.
    const email = `e2e-rate-${Date.now()}@example.com`;
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await request.post("/api/v1/auth/password-login", {
        data: { email, password: "wrong-on-purpose" },
      });
      codes.push(r.status());
    }
    expect(codes).toContain(429);
  });
});
