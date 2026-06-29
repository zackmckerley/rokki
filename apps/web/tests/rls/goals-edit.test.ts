/**
 * Tests for the goal `period` column (20260629140000_goals_period.sql) and the
 * edit/archive write paths: a scope member can set a goal's cadence, rename it,
 * and archive it; the column round-trips and the CHECK rejects bad values.
 *
 * Mirrors tests/rls/goals-add-entry.test.ts plumbing.
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

const EM = "goals-edit-member@rokki.local";

describe("goals goal period + edit/archive", () => {
  let member: SupabaseClient;
  let goalId: string;

  beforeAll(async () => {
    const memberId = await ensureUser(EM);
    member = await makeClientFor(EM);

    const slug = `goals-edit-${Math.random().toString(36).slice(2, 8)}`;
    const { data: sp } = await admin
      .from("spaces")
      .insert({ slug, name: "Goals Edit", created_by: memberId })
      .select("id")
      .single();
    const spaceId = (sp as { id: string }).id;
    await admin.from("space_members").insert({ space_id: spaceId, user_id: memberId, role: "owner" });

    const { data: cat } = await admin
      .from("goals_categories")
      .insert({ space_id: spaceId, name: "Biz", color: "#4A3AA7" })
      .select("id")
      .single();
    const { data: goal, error } = await admin
      .from("goals_goals")
      .insert({ category_id: (cat as { id: string }).id, name: "Closings", unit: "deals", period: "monthly" })
      .select("id, period")
      .single();
    if (error) throw new Error(`goal: ${error.message}`);
    goalId = (goal as { id: string }).id;
    expect((goal as { period: string }).period).toBe("monthly");
  }, 30_000);

  it("a member can change a goal's cadence (period) and rename it", async () => {
    const { error } = await member
      .from("goals_goals")
      .update({ name: "Deals closed", period: "weekly" })
      .eq("id", goalId);
    expect(error).toBeNull();
    const { data } = await admin
      .from("goals_goals")
      .select("name, period")
      .eq("id", goalId)
      .single();
    expect((data as { name: string; period: string }).name).toBe("Deals closed");
    expect((data as { period: string }).period).toBe("weekly");
  });

  it("rejects an invalid period (CHECK constraint)", async () => {
    const { error } = await member
      .from("goals_goals")
      .update({ period: "hourly" })
      .eq("id", goalId);
    expect(error).not.toBeNull();
  });

  it("a member can archive a goal (and restore it)", async () => {
    await member
      .from("goals_goals")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", goalId);
    const { data: archived } = await admin
      .from("goals_goals")
      .select("archived_at")
      .eq("id", goalId)
      .single();
    expect((archived as { archived_at: string | null }).archived_at).not.toBeNull();

    await member.from("goals_goals").update({ archived_at: null }).eq("id", goalId);
    const { data: restored } = await admin
      .from("goals_goals")
      .select("archived_at")
      .eq("id", goalId)
      .single();
    expect((restored as { archived_at: string | null }).archived_at).toBeNull();
  });
});
