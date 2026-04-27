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
 *
 * Two projects:
 *   - `chromium`        — the standard E2E suite under `tests/e2e/`
 *   - `visual`          — visual regression snapshots under `tests/visual/`.
 *                         Pinned viewport + animations off so screenshots
 *                         are deterministic. Snapshot baselines live next
 *                         to the spec under `__snapshots__/`.
 *
 * Visual snapshot diffs do not auto-fail CI on `main` — see
 * `.github/workflows/ci.yml` (visual-regression job) for the
 * `continue-on-error: true` policy. Failures are flagged for human review.
 */

const PORT = Number(process.env.PORT ?? 3000);
const BASE = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    // Visual diffs: 0.2 max ratio of differing pixels. Below this we
    // call the snapshot a match. Anti-aliasing differences (~0.05 ratio)
    // are why we can't use the default 0 threshold.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      caret: "hide",
    },
  },
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
    {
      name: "chromium",
      testDir: "./tests/e2e",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "visual",
      testDir: "./tests/visual",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        // Force the dark theme that's the design system's default so the
        // baseline doesn't flip when an OS preference changes.
        colorScheme: "dark",
        deviceScaleFactor: 1,
      },
    },
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
