/**
 * Tests for goals_add_entry (20260629130000_goals_add_entry.sql): the atomic
 * "+N to today's total" RPC behind the dashboard quick-log. Verifies it
 * accumulates, clamps at 0, and is RLS-scoped to scope members.
 *
 * Mirrors tests/rls/contacts-linking.test.ts plumbing.
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
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data) throw new Error(`generateLink failed: ${error?.message}`);
  const supabase = createClient(SB_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: v, error: vErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (vErr || !v.session) throw new Error(`verifyOtp failed: ${vErr?.message}`);
  await supabase.auth.setSession({
    access_token: v.session.access_token,
    refresh_token: v.session.refresh_token,
  });
  return supabase;
}

async function ensureUser(email: string): Promise<string> {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message}`);
  return data.user.id;
}

const TODAY = "2026-06-29";
const EM = "goals-member@rokki.local";
const EO = "goals-outsider@rokki.local";

describe("goals_add_entry (atomic additive logging)", () => {
  let member: SupabaseClient;
  let outsider: SupabaseClient;
  let goalId: string;

  beforeAll(async () => {
    const memberId = await ensureUser(EM);
    await ensureUser(EO);
    member = await makeClientFor(EM);
    outsider = await makeClientFor(EO);

    const slug = `goals-test-${Math.random().toString(36).slice(2, 8)}`;
    const { data: sp, error: spErr } = await admin
      .from("spaces")
      .insert({ slug, name: "Goals Test", created_by: memberId })
      .select("id")
      .single();
    if (spErr) throw new Error(`space: ${spErr.message}`);
    const spaceId = (sp as { id: string }).id;
    await admin.from("space_members").insert({ space_id: spaceId, user_id: memberId, role: "owner" });

    const { data: cat, error: catErr } = await admin
      .from("goals_categories")
      .insert({ space_id: spaceId, name: "Health", color: "#22C55E" })
      .select("id")
      .single();
    if (catErr) throw new Error(`category: ${catErr.message}`);

    const { data: goal, error: goalErr } = await admin
      .from("goals_goals")
      .insert({ category_id: (cat as { id: string }).id, name: "Workouts", unit: "sessions" })
      .select("id")
      .single();
    if (goalErr) throw new Error(`goal: ${goalErr.message}`);
    goalId = (goal as { id: string }).id;
  }, 30_000);

  it("accumulates successive adds for the same day", async () => {
    const a = await member.rpc("goals_add_entry", {
      p_goal_id: goalId,
      p_entry_date: TODAY,
      p_delta: 5,
    });
    expect(a.error).toBeNull();
    expect(Number(a.data)).toBe(5);

    const b = await member.rpc("goals_add_entry", {
      p_goal_id: goalId,
      p_entry_date: TODAY,
      p_delta: 3,
    });
    expect(Number(b.data)).toBe(8);
  });

  it("clamps the running total at zero on an over-correction", async () => {
    const c = await member.rpc("goals_add_entry", {
      p_goal_id: goalId,
      p_entry_date: TODAY,
      p_delta: -100,
    });
    expect(c.error).toBeNull();
    expect(Number(c.data)).toBe(0);
  });

  it("blocks a non-member from logging against a goal they can't see", async () => {
    // .rpc returns { error } on an RLS rejection (it doesn't throw).
    await outsider.rpc("goals_add_entry", {
      p_goal_id: goalId,
      p_entry_date: TODAY,
      p_delta: 9,
    });
    // The security invariant: the value is untouched (still 0 from the clamp
    // test) — RLS WITH CHECK on goals_entries_write rejected the outsider's add.
    const { data: row } = await admin
      .from("goals_entries")
      .select("value")
      .eq("goal_id", goalId)
      .eq("entry_date", TODAY)
      .maybeSingle();
    expect(Number((row as { value: number }).value)).toBe(0);
  });
});
