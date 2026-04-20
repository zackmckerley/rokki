import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Rokki.
 *
 * Run: `pnpm test:e2e`
 *
 * The web server is expected to be running already (e.g. `pnpm dev` in one
 * terminal and `pnpm test:e2e` in another) — Playwright's built-in
 * `webServer` option can start it, but we avoid the Next build step during
 * dev iteration. Use `webServer` in CI.
 */

const PORT = Number(process.env.PORT ?? 3000);
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: process.env.CI
    ? {
        command: "pnpm start",
        url: BASE,
        timeout: 120_000,
        reuseExistingServer: false,
      }
    : undefined,
});
