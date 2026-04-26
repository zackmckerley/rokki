import { test, expect } from "@playwright/test";
import { signInAs, apiAs, uniqueTicker } from "../e2e/helpers";

/**
 * Visual snapshots for authenticated surfaces — dashboard, panes,
 * notification bell, command palette, explorer rail.
 *
 * Gated on E2E_SEEDED=true. CI does not block on visual diff failures
 * (continue-on-error in the workflow).
 */

const SEEDED = process.env.E2E_SEEDED === "true";
test.skip(!SEEDED, "Set E2E_SEEDED=true with a seeded Supabase to run");

test.describe("authenticated surfaces — visual", () => {
  let ticker = "";

  test.beforeAll(async () => {
    // Spin up a fresh terminal with five tasks so the TasksPane snapshot
    // is deterministic regardless of what's in the seed.
    const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
    const { api } = await apiAs("zack", baseURL);
    const spaceResp = await api.get("/api/v1/orgs/helios");
    const spaceBody = (await spaceResp.json()) as { data: { id: string } };
    ticker = uniqueTicker("VIS");
    await api.post("/api/v1/projects", {
      data: {
        space_id: spaceBody.data.id,
        name: "Visual fixtures",
        ticker,
        type: "general",
      },
    });
    // Five tasks with deliberately varied priority + status.
    const tasks = [
      { title: "Critical bug", priority: 1, status: "in_progress" },
      { title: "High prio refactor", priority: 1, status: "todo" },
      { title: "Normal task", priority: 2, status: "todo" },
      { title: "Low prio cleanup", priority: 3, status: "in_progress" },
      { title: "Done task", priority: 4, status: "done" },
    ];
    for (const t of tasks) {
      await api.post(`/api/v1/projects/${ticker}/tasks`, { data: t });
    }
    await api.dispose();
  });

  test("empty dashboard", async ({ browser, baseURL }) => {
    // bank user has no terminals in the standard seed → near-empty state.
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await signInAs(ctx, "bank", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("dashboard-empty.png", {
      fullPage: true,
    });
    await ctx.close();
  });

  test("TasksPane with 5 tasks (varied priority + status)", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await signInAs(ctx, "zack", baseURL!);
    const page = await ctx.newPage();
    await page.goto(`/p/${ticker}`);
    // Wait until at least one task row renders.
    await expect(page.getByText("Critical bug")).toBeVisible({
      timeout: 10_000,
    });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("tasks-pane-five.png", {
      fullPage: true,
    });
    await ctx.close();
  });

  test("FilesPane grid view (3 image thumbs + 5 non-image)", async ({
    browser,
    baseURL,
  }) => {
    // Seed a deterministic mix of files for the snapshot.
    const { api } = await apiAs("zack", baseURL!);
    const fileTicker = uniqueTicker("VFL");
    const spaceResp = await api.get("/api/v1/orgs/helios");
    const spaceBody = (await spaceResp.json()) as { data: { id: string } };
    await api.post("/api/v1/projects", {
      data: {
        space_id: spaceBody.data.id,
        name: "Visual files",
        ticker: fileTicker,
        type: "general",
      },
    });

    const fixtures = [
      { name: "photo-1.png", mime: "image/png" },
      { name: "photo-2.png", mime: "image/png" },
      { name: "photo-3.png", mime: "image/png" },
      { name: "spec.pdf", mime: "application/pdf" },
      { name: "notes.txt", mime: "text/plain" },
      { name: "budget.xlsx", mime: "application/vnd.openxmlformats" },
      { name: "drawings.dwg", mime: "application/acad" },
      { name: "contract.docx", mime: "application/vnd.openxmlformats-word" },
    ];
    for (const f of fixtures) {
      await api.post(`/api/v1/projects/${fileTicker}/files`, {
        multipart: {
          file: {
            name: f.name,
            mimeType: f.mime,
            buffer: Buffer.from("fixture", "ascii"),
          },
          folder: "/",
          visibility: "project",
        },
      });
    }
    await api.dispose();

    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await signInAs(ctx, "zack", baseURL!);
    const page = await ctx.newPage();
    await page.goto(`/p/${fileTicker}`);
    // Best-effort: surface the FilesPane via F2 if not already on screen.
    await page.locator("body").click();
    await page.keyboard.press("F2").catch(() => {});
    await expect(page.getByText("spec.pdf")).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("files-pane-grid.png", {
      fullPage: true,
    });
    await ctx.close();
  });

  test("notification bell — closed", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await signInAs(ctx, "zack", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/");
    const bell = page.getByRole("button", { name: /notifications/i });
    await expect(bell).toBeVisible({ timeout: 10_000 });
    await expect(bell).toHaveScreenshot("bell-closed.png");
    await ctx.close();
  });

  test("notification bell — open with notifications", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await signInAs(ctx, "zack", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: /notifications/i }).first().click();
    // Either populated panel or empty-state — both are valid snapshots.
    await page.waitForTimeout(300); // panel transition
    await expect(page).toHaveScreenshot("bell-open.png", {
      clip: { x: 1000, y: 0, width: 280, height: 500 },
    });
    await ctx.close();
  });

  test("notification bell — open empty", async ({ browser, baseURL }) => {
    // bank user → no notifications.
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await signInAs(ctx, "bank", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: /notifications/i }).first().click();
    await page.waitForTimeout(300);
    await expect(page).toHaveScreenshot("bell-open-empty.png", {
      clip: { x: 1000, y: 0, width: 280, height: 500 },
    });
    await ctx.close();
  });

  test("explorer rail — collapsed", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await signInAs(ctx, "zack", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    // Click each space chevron to collapse all groups.
    const chevs = page.locator('button[aria-expanded="true"]');
    const count = await chevs.count();
    for (let i = 0; i < count; i++) {
      await chevs.nth(i).click().catch(() => {});
    }
    await expect(page).toHaveScreenshot("explorer-collapsed.png", {
      clip: { x: 0, y: 44, width: 240, height: 700 },
    });
    await ctx.close();
  });

  test("explorer rail — expanded", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await signInAs(ctx, "zack", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot("explorer-expanded.png", {
      clip: { x: 0, y: 44, width: 240, height: 700 },
    });
    await ctx.close();
  });

  test("explorer rail — filtered", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await signInAs(ctx, "zack", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/");
    const filter = page
      .getByRole("textbox", { name: /filter|search terminals/i })
      .or(page.getByPlaceholder(/search|filter/i))
      .first();
    if (await filter.count()) {
      await filter.fill("HEL");
    }
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot("explorer-filtered.png", {
      clip: { x: 0, y: 44, width: 240, height: 700 },
    });
    await ctx.close();
  });

  test("command palette — open with results", async ({
    browser,
    baseURL,
  }) => {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      colorScheme: "dark",
    });
    await signInAs(ctx, "zack", baseURL!);
    const page = await ctx.newPage();
    await page.goto("/");
    await page.locator("body").click();
    await page.keyboard.press("Control+K");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.type("Tools");
    // Let the result list settle.
    await page.waitForTimeout(200);
    await expect(page).toHaveScreenshot("palette-open.png", { fullPage: true });
    await ctx.close();
  });
});
