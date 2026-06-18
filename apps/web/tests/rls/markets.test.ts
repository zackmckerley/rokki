/**
 * RLS tests for the markets tables (`mkt_*`).
 *
 * Runs against the local Supabase stack (CI spins it up via `supabase db
 * reset`). Verifies the policies from `20260616010000_markets_init.sql`:
 *
 *   - mkt_instruments / mkt_quote_cache — public read for any authenticated
 *     user; writes are service-role only (authenticated INSERT is denied).
 *   - mkt_watchlists / mkt_portfolios — scope-polymorphic; visible/writable
 *     only to the owning user, or members of the owning space/terminal.
 *   - mkt_watchlist_symbols / mkt_lots — inherit visibility from their parent
 *     watchlist/portfolio (a non-owner can't read or write children).
 *   - mkt_alerts — strictly personal (user_id = auth.uid()); WITH CHECK blocks
 *     forging an alert for another user.
 *
 * Mirrors tests/rls/personal-space.test.ts for the auth/session plumbing.
 * Terminal-scope policies are structurally identical to space-scope (the
 * migration uses the same `IN (SELECT … FROM terminal_members …)` shape), so
 * the space-scope cases below exercise that path by proxy.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SB_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(SB_URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function makeClientFor(email: string): Promise<SupabaseClient> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data) throw new Error(`generateLink failed: ${error?.message}`);
  const supabase = createClient(SB_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verifyData, error: verifyErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyErr) throw new Error(`verifyOtp failed: ${verifyErr.message}`);
  if (!verifyData.session) throw new Error("no session after verifyOtp");
  await supabase.auth.setSession({
    access_token: verifyData.session.access_token,
    refresh_token: verifyData.session.refresh_token,
  });
  return supabase;
}

async function ensureUser(email: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

/** The user's auto-provisioned personal space — a space they (and only they)
 *  are a `space_members` row of, which lets us exercise space-scope policies
 *  without standing up a separate space + membership. */
async function personalSpaceOf(userId: string): Promise<string> {
  const { data, error } = await admin
    .from("spaces")
    .select("id")
    .eq("personal_owner_id", userId)
    .eq("is_personal", true);
  if (error) throw new Error(`personalSpaceOf: ${error.message}`);
  const rows = (data ?? []) as { id: string }[];
  expect(rows.length).toBe(1);
  return rows[0].id;
}

describe("RLS — markets (mkt_*)", () => {
  let userA: string;
  let userB: string;
  let spaceA: string; // a space userA belongs to and userB does not
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  beforeAll(async () => {
    userA = await ensureUser("mkt-rls-a@rokki.local");
    userB = await ensureUser("mkt-rls-b@rokki.local");
    spaceA = await personalSpaceOf(userA);
    clientA = await makeClientFor("mkt-rls-a@rokki.local");
    clientB = await makeClientFor("mkt-rls-b@rokki.local");
  }, 30_000);

  // ----- public reference tables: read-any, write-service-role-only -----

  it("mkt_instruments: any authenticated user can read", async () => {
    const { error } = await clientA.from("mkt_instruments").select("symbol").limit(1);
    expect(error).toBeNull();
  });

  it("mkt_instruments: authenticated user cannot insert (service-role only)", async () => {
    const { error } = await clientA
      .from("mkt_instruments")
      .insert({ symbol: "RLSTST", name: "nope" });
    expect(error).toBeTruthy();
  });

  it("mkt_quote_cache: any authenticated user can read", async () => {
    const { error } = await clientA.from("mkt_quote_cache").select("symbol").limit(1);
    expect(error).toBeNull();
  });

  it("mkt_quote_cache: authenticated user cannot insert (service-role only)", async () => {
    const { error } = await clientA
      .from("mkt_quote_cache")
      .insert({ symbol: "RLSTST", payload: {}, provider: "test" });
    expect(error).toBeTruthy();
  });

  // ----- user-scoped watchlists -----

  let userWatchlist: string;

  it("owner can create a user-scoped watchlist", async () => {
    const { data, error } = await clientA
      .from("mkt_watchlists")
      .insert({ user_id: userA, name: "A's watchlist", created_by: userA })
      .select("id")
      .single();
    expect(error).toBeNull();
    userWatchlist = (data as { id: string }).id;
  });

  it("owner sees their own watchlist", async () => {
    const { data, error } = await clientA
      .from("mkt_watchlists")
      .select("id")
      .eq("id", userWatchlist)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  it("another user cannot see someone else's watchlist", async () => {
    const { data } = await clientB
      .from("mkt_watchlists")
      .select("id")
      .eq("id", userWatchlist)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("a user cannot create a watchlist owned by someone else (WITH CHECK)", async () => {
    const { error } = await clientB
      .from("mkt_watchlists")
      .insert({ user_id: userA, name: "B forging A", created_by: userA });
    expect(error).toBeTruthy();
  });

  it("another user cannot delete the owner's watchlist", async () => {
    await clientB.from("mkt_watchlists").delete().eq("id", userWatchlist);
    const { data } = await admin
      .from("mkt_watchlists")
      .select("id")
      .eq("id", userWatchlist)
      .maybeSingle();
    expect(data).toBeTruthy();
  });

  // ----- watchlist symbols inherit the watchlist's visibility -----

  it("owner can add a symbol to their watchlist", async () => {
    const { error } = await clientA
      .from("mkt_watchlist_symbols")
      .insert({ watchlist_id: userWatchlist, symbol: "AAPL" });
    expect(error).toBeNull();
  });

  it("another user cannot add a symbol to the owner's watchlist", async () => {
    const { error } = await clientB
      .from("mkt_watchlist_symbols")
      .insert({ watchlist_id: userWatchlist, symbol: "TSLA" });
    expect(error).toBeTruthy();
  });

  it("another user cannot read the owner's watchlist symbols", async () => {
    const { data } = await clientB
      .from("mkt_watchlist_symbols")
      .select("symbol")
      .eq("watchlist_id", userWatchlist);
    expect((data ?? []).length).toBe(0);
  });

  // ----- space-scoped watchlist (exercises the membership path) -----

  it("a space member can create a space-scoped watchlist", async () => {
    const { error } = await clientA
      .from("mkt_watchlists")
      .insert({ space_id: spaceA, name: "A's space watchlist", created_by: userA });
    expect(error).toBeNull();
  });

  it("a non-member cannot create a watchlist in that space", async () => {
    const { error } = await clientB
      .from("mkt_watchlists")
      .insert({ space_id: spaceA, name: "B intrudes", created_by: userB });
    expect(error).toBeTruthy();
  });

  // ----- portfolios + lots -----

  let userPortfolio: string;

  it("owner can create a user-scoped portfolio", async () => {
    const { data, error } = await clientA
      .from("mkt_portfolios")
      .insert({ user_id: userA, name: "A's portfolio", created_by: userA })
      .select("id")
      .single();
    expect(error).toBeNull();
    userPortfolio = (data as { id: string }).id;
  });

  it("another user cannot see the owner's portfolio", async () => {
    const { data } = await clientB
      .from("mkt_portfolios")
      .select("id")
      .eq("id", userPortfolio)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("owner can add a lot to their portfolio", async () => {
    const { error } = await clientA.from("mkt_lots").insert({
      portfolio_id: userPortfolio,
      symbol: "AAPL",
      side: "buy",
      quantity: 10,
      price: 190,
      trade_date: "2026-01-02",
    });
    expect(error).toBeNull();
  });

  it("another user cannot add a lot to the owner's portfolio", async () => {
    const { error } = await clientB.from("mkt_lots").insert({
      portfolio_id: userPortfolio,
      symbol: "TSLA",
      side: "buy",
      quantity: 1,
      price: 200,
      trade_date: "2026-01-02",
    });
    expect(error).toBeTruthy();
  });

  it("another user cannot read the owner's lots", async () => {
    const { data } = await clientB
      .from("mkt_lots")
      .select("id")
      .eq("portfolio_id", userPortfolio);
    expect((data ?? []).length).toBe(0);
  });

  // ----- alerts: strictly personal -----

  it("owner can create a personal price alert", async () => {
    const { error } = await clientA.from("mkt_alerts").insert({
      user_id: userA,
      symbol: "AAPL",
      condition: "price_above",
      threshold: 250,
    });
    expect(error).toBeNull();
  });

  it("another user cannot see the owner's alerts", async () => {
    const { data } = await clientB
      .from("mkt_alerts")
      .select("id")
      .eq("user_id", userA);
    expect((data ?? []).length).toBe(0);
  });

  it("a user cannot create an alert for another user (WITH CHECK)", async () => {
    const { error } = await clientB.from("mkt_alerts").insert({
      user_id: userA,
      symbol: "AAPL",
      condition: "price_below",
      threshold: 100,
    });
    expect(error).toBeTruthy();
  });
});
