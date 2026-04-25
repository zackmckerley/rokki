import { test, expect } from "@playwright/test";
import { apiAs, signInAs, uniqueTicker, SEED } from "./helpers";

/**
 * The 18-step acceptance walkthrough from `docs/11_ACCEPTANCE.md §11.3.10`.
 *
 * Adapted to use the seeded local dev stack (admin / zack / carlos /
 * maria / bank). Auth uses `/api/dev/session-as` instead of the magic-
 * link round-trip — the magic-link flow itself is covered by
 * smoke.spec.ts.
 *
 * Steps 11–16 (Claude Desktop MCP simulation) need a JSON-RPC SSE
 * client and a running MCP server; they're stubbed here.
 *
 * Skip note: `E2E_SEEDED=true` enables the suite. Without it the suite
 * is no-op so dev machines without a seeded local stack don't fail.
 */

const SEEDED = process.env.E2E_SEEDED === "true";
test.skip(!SEEDED, "Set E2E_SEEDED=true with a seeded Supabase to run");

const ticker = uniqueTicker("BRKL");
const spaceSlug = "helios"; // seeded
let terminalId = "";
let zackTokenId = "";

test.describe.serial("acceptance: full user journey", () => {
  test("1. Zack signs in (dev shortcut for magic link)", async ({
    baseURL,
  }) => {
    const { api, email } = await apiAs("zack", baseURL!);
    expect(email).toBe(SEED.zack);
    await api.dispose();
  });

  test("2. Zack creates terminal in the seeded HELIOS space", async ({
    baseURL,
  }) => {
    const { api } = await apiAs("zack", baseURL!);
    const spaceResp = await api.get(`/api/v1/orgs/${spaceSlug}`);
    expect(spaceResp.ok()).toBeTruthy();
    const spaceBody = (await spaceResp.json()) as { data: { id: string } };
    const r = await api.post("/api/v1/projects", {
      data: {
        space_id: spaceBody.data.id,
        name: "123 Brickell — acceptance fixture",
        ticker,
        type: "construction",
      },
    });
    expect(r.status()).toBe(201);
    const body = (await r.json()) as { data: { id: string; ticker: string } };
    terminalId = body.data.id;
    expect(body.data.ticker).toBe(ticker);
    await api.dispose();
  });

  test("3. Zack lands at /p/<ticker>", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext();
    await signInAs(ctx, "zack", baseURL!);
    const page = await ctx.newPage();
    const resp = await page.goto(`/p/${ticker}`);
    expect(resp?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toContainText(ticker);
    await ctx.close();
  });

  test("4. Zack invites Carlos as architect", async ({ baseURL }) => {
    const { api } = await apiAs("zack", baseURL!);
    const r = await api.post(`/api/v1/projects/${ticker}/members`, {
      data: { email: SEED.carlos, role: "architect" },
    });
    expect(r.ok()).toBeTruthy();
    await api.dispose();
  });

  test("5. Zack invites Maria as manager", async ({ baseURL }) => {
    const { api } = await apiAs("zack", baseURL!);
    const r = await api.post(`/api/v1/projects/${ticker}/members`, {
      data: { email: SEED.maria, role: "manager" },
    });
    expect(r.ok()).toBeTruthy();
    await api.dispose();
  });

  test("6. Carlos sees the new terminal in his list", async ({ baseURL }) => {
    const { api } = await apiAs("carlos", baseURL!);
    const r = await api.get(`/api/v1/projects`);
    expect(r.ok()).toBeTruthy();
    const body = (await r.json()) as { data: { ticker: string }[] };
    expect(body.data.some((t) => t.ticker === ticker)).toBe(true);
    await api.dispose();
  });

  test("7. Zack uploads permit.pdf (visibility owners)", async ({
    baseURL,
  }) => {
    const { api } = await apiAs("zack", baseURL!);
    const r = await api.post(`/api/v1/projects/${ticker}/files`, {
      multipart: {
        file: {
          name: "permit.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\n", "ascii"),
        },
        folder: "/",
        visibility: "owners",
      },
    });
    expect(r.ok()).toBeTruthy();
    await api.dispose();
  });

  test("8. Zack uploads A200.pdf (visibility project)", async ({
    baseURL,
  }) => {
    const { api } = await apiAs("zack", baseURL!);
    const r = await api.post(`/api/v1/projects/${ticker}/files`, {
      multipart: {
        file: {
          name: "A200.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\n", "ascii"),
        },
        folder: "/",
        visibility: "project",
      },
    });
    expect(r.ok()).toBeTruthy();
    await api.dispose();
  });

  test("9. Carlos sees A200 but NOT permit (owners-only)", async ({
    baseURL,
  }) => {
    const { api } = await apiAs("carlos", baseURL!);
    const r = await api.get(`/api/v1/projects/${ticker}/files?folder=/`);
    expect(r.ok()).toBeTruthy();
    const body = (await r.json()) as {
      data: { filename: string; visibility: string }[];
    };
    const names = body.data.map((f) => f.filename);
    expect(names).toContain("A200.pdf");
    expect(names).not.toContain("permit.pdf");
    await api.dispose();
  });

  test("10. Zack creates a write-scoped, terminal-restricted token", async ({
    baseURL,
  }) => {
    const { api } = await apiAs("zack", baseURL!);
    const r = await api.post(`/api/v1/me/tokens`, {
      data: {
        name: `acceptance-${ticker}`,
        scopes: ["read", "write"],
        project_restrictions: [terminalId],
      },
    });
    expect(r.status()).toBe(201);
    const body = (await r.json()) as {
      data: { id: string; token: string };
    };
    zackTokenId = body.data.id;
    expect(body.data.token).toMatch(/^rk_/);
    await api.dispose();
  });

  test.fixme(
    "11–16. Claude Desktop MCP roundtrip (token-scoped, RAG, citation)",
    async () => {
      // Live MCP simulation TODO. Plan: spin up the mcp-server JSON-RPC
      // client, list tools with the rk_ token, call rokki_ask_terminal,
      // assert citation comes back for Zack and "no access" for Carlos.
    },
  );

  test("17. Zack revokes the token", async ({ baseURL }) => {
    const { api } = await apiAs("zack", baseURL!);
    expect(zackTokenId).toBeTruthy();
    const r = await api.delete(`/api/v1/me/tokens/${zackTokenId}`);
    expect(r.ok()).toBeTruthy();
    await api.dispose();
  });

  test("18. Zack archives the terminal; it disappears from member lists", async ({
    baseURL,
  }) => {
    const zk = await apiAs("zack", baseURL!);
    const arch = await zk.api.delete(`/api/v1/projects/${ticker}`);
    expect(arch.ok()).toBeTruthy();
    await zk.api.dispose();

    for (const u of ["zack", "carlos", "maria"] as const) {
      const { api } = await apiAs(u, baseURL!);
      const r = await api.get(`/api/v1/projects`);
      expect(r.ok()).toBeTruthy();
      const body = (await r.json()) as { data: { ticker: string }[] };
      expect(body.data.some((t) => t.ticker === ticker)).toBe(false);
      await api.dispose();
    }
  });
});
