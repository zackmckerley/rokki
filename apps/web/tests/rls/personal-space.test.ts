/**
 * RLS + behaviour tests for Personal Spaces.
 *
 * Runs against the local Supabase stack (CI spins it up). Verifies the
 * invariants from the 20260614120000_personal_spaces migration:
 *
 *   - every user is auto-provisioned exactly one personal space
 *   - the owner can see their own personal space; nobody else can
 *   - the owner CAN create terminals inside it (the headline requirement)
 *   - no one can add a second member to a personal space
 *   - a personal space can't be deleted
 *
 * Mirrors tests/rls/project-scope.test.ts for the auth/session plumbing.
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

async function personalSpaceOf(userId: string): Promise<string> {
  const { data, error } = await admin
    .from("spaces")
    .select("id")
    .eq("personal_owner_id", userId)
    .eq("is_personal", true);
  if (error) throw new Error(`personalSpaceOf: ${error.message}`);
  const rows = (data ?? []) as { id: string }[];
  // Exactly one personal space per user — enforced by the partial unique index.
  expect(rows.length).toBe(1);
  return rows[0].id;
}

describe("RLS — personal spaces", () => {
  let userA: string;
  let userB: string;
  let personalA: string;
  let personalB: string;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  beforeAll(async () => {
    userA = await ensureUser("personal-a@rokki.local");
    userB = await ensureUser("personal-b@rokki.local");
    // The handle_new_user trigger provisions a personal space synchronously
    // on insert, so by now both users have exactly one.
    personalA = await personalSpaceOf(userA);
    personalB = await personalSpaceOf(userB);
    clientA = await makeClientFor("personal-a@rokki.local");
    clientB = await makeClientFor("personal-b@rokki.local");
  }, 30_000);

  it("auto-provisions exactly one personal space per user, named Personal", async () => {
    const { data } = await admin
      .from("spaces")
      .select("name, is_personal")
      .eq("id", personalA)
      .maybeSingle();
    expect((data as { is_personal?: boolean } | null)?.is_personal).toBe(true);
    expect((data as { name?: string } | null)?.name).toBe("Personal");
    // personalSpaceOf already asserts the count is 1.
    expect(personalA).not.toBe(personalB);
  });

  it("owner can see their own personal space", async () => {
    const { data, error } = await clientA
      .from("spaces")
      .select("id, is_personal")
      .eq("id", personalA)
      .maybeSingle();
    expect(error).toBeNull();
    expect((data as { is_personal?: boolean } | null)?.is_personal).toBe(true);
  });

  it("another user cannot see someone else's personal space", async () => {
    const { data } = await clientB
      .from("spaces")
      .select("id")
      .eq("id", personalA)
      .maybeSingle();
    // RLS filters it out → null. (No leak of even its existence.)
    expect(data).toBeNull();
  });

  it("owner CAN create a terminal inside their personal space", async () => {
    const { data, error } = await clientA
      .from("terminals")
      .insert({
        space_id: personalA,
        ticker: "PERS",
        name: "Notes",
        created_by: userA,
      })
      .select("id, space_id")
      .single();
    expect(error).toBeNull();
    expect((data as { space_id?: string } | null)?.space_id).toBe(personalA);
  });

  it("another user cannot create a terminal in someone else's personal space", async () => {
    const { error } = await clientB.from("terminals").insert({
      space_id: personalA,
      ticker: "INTRUDE",
      name: "Intruder",
      created_by: userB,
    });
    expect(error).toBeTruthy();
  });

  it("nobody can add a second member to a personal space", async () => {
    const { error } = await clientA.from("space_members").insert({
      space_id: personalA,
      user_id: userB,
      role: "member",
    });
    expect(error).toBeTruthy();
    // And it really didn't land.
    const { data: members } = await admin
      .from("space_members")
      .select("user_id")
      .eq("space_id", personalA);
    expect((members ?? []).length).toBe(1);
  });

  it("a personal space cannot be deleted by its owner", async () => {
    await clientA.from("spaces").delete().eq("id", personalA);
    // RLS USING excludes personal spaces, so the DELETE matches 0 rows
    // (it may not error). Confirm the space still exists.
    const { data: still } = await admin
      .from("spaces")
      .select("id")
      .eq("id", personalA)
      .maybeSingle();
    expect(still).toBeTruthy();
  });
});
