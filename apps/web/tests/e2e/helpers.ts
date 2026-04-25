import {
  type APIRequestContext,
  type BrowserContext,
  request,
} from "@playwright/test";

/**
 * Test helpers for the acceptance suite.
 *
 *   - apiAs(user)           — fresh APIRequestContext with cookies set
 *                              via /api/dev/session-as. Re-use the
 *                              returned context for every API call in
 *                              the same test for cookie continuity.
 *   - signInAs(ctx, user)   — same, but also pushes cookies into a
 *                              browser context so page.goto() works.
 *   - uniqueTicker()        — collision-free ticker per test run.
 *
 * `/api/dev/session-as` is dev-only (404s in production), so the suite
 * implicitly requires a local stack with the canonical seeded users.
 */

export const SEED = {
  admin: "admin@rokki.local",
  zack: "zack@rokki.local",
  carlos: "carlos@rokki.local",
  maria: "maria@rokki.local",
  bank: "bank@rokki.local",
} as const;

export type SeedUser = keyof typeof SEED;

/**
 * Build an APIRequestContext authenticated as the given seed user.
 * Cookies persist on the context — pass it around your test and reuse
 * `ctx.get()` / `ctx.post()` etc.
 */
export async function apiAs(
  user: SeedUser,
  baseURL: string,
): Promise<{ api: APIRequestContext; user_id: string; email: string }> {
  const api = await request.newContext({ baseURL });
  const r = await api.post("/api/dev/session-as", {
    data: { email: SEED[user] },
  });
  if (!r.ok()) {
    throw new Error(
      `session-as failed for ${user}: ${r.status()} (is the dev server running with NODE_ENV != production?)`,
    );
  }

  const me = await api.get("/api/v1/me");
  if (!me.ok()) {
    throw new Error(
      `/api/v1/me failed after session-as: ${me.status()}`,
    );
  }
  const body = (await me.json()) as {
    data: { user_id: string; email: string };
  };
  return { api, user_id: body.data.user_id, email: body.data.email };
}

/**
 * Same as apiAs, but also seeds cookies into the supplied browser
 * context so page navigation works. Use when a step needs to visit
 * pages, not just call APIs.
 */
export async function signInAs(
  ctx: BrowserContext,
  user: SeedUser,
  baseURL: string,
): Promise<{ user_id: string; email: string }> {
  const { api, user_id, email } = await apiAs(user, baseURL);
  const state = await api.storageState();
  // localhost cookies need the `domain` field stripped — addCookies
  // requires URL-based scoping when domain isn't a public suffix.
  const cookies = state.cookies.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain || new URL(baseURL).hostname,
    path: c.path || "/",
    expires: c.expires === -1 ? undefined : c.expires,
    httpOnly: c.httpOnly,
    secure: c.secure,
    sameSite: c.sameSite,
  }));
  await ctx.addCookies(cookies);
  await api.dispose();
  return { user_id, email };
}

/**
 * Stable unique ticker per test run — concurrent runs don't collide on
 * the (space, ticker) unique index.
 */
export function uniqueTicker(prefix = "TEST"): string {
  const tail = Array.from({ length: 4 })
    .map(() => String.fromCharCode(65 + Math.floor(Math.random() * 26)))
    .join("");
  return `${prefix}${tail}`.slice(0, 10);
}
