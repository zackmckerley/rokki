/**
 * Tests for the self-contact (20260629120000_contacts_self_contact.sql):
 * every Rokki user gets exactly one Contact representing themselves
 * (owner_id = user_id = the user), created at signup, visible only to its owner,
 * and not duplicable.
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
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data) throw new Error(`generateLink failed: ${error?.message}`);
  const supabase = createClient(SB_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: v, error: vErr } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (vErr) throw new Error(`verifyOtp failed: ${vErr.message}`);
  if (!v.session) throw new Error("no session after verifyOtp");
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

const ES = "self-a@rokki.local";
const EO = "self-other@rokki.local";

describe("self-contact", () => {
  let userS: string;
  let userO: string;
  let clientS: SupabaseClient;
  let clientO: SupabaseClient;

  beforeAll(async () => {
    userS = await ensureUser(ES);
    userO = await ensureUser(EO);
    clientS = await makeClientFor(ES);
    clientO = await makeClientFor(EO);
  }, 30_000);

  async function selfRows(uid: string): Promise<Record<string, unknown>[]> {
    const { data } = await admin
      .from("contacts")
      .select("*")
      .eq("owner_id", uid)
      .eq("user_id", uid);
    return (data ?? []) as Record<string, unknown>[];
  }

  it("creates exactly one self-contact at signup", async () => {
    expect((await selfRows(userS)).length).toBe(1);
  });

  it("is owned by AND linked to the same user", async () => {
    const [c] = await selfRows(userS);
    expect(c.owner_id).toBe(userS);
    expect(c.user_id).toBe(userS);
  });

  it("mirrors the user's identity (email + name) and is marked source=self", async () => {
    const [c] = await selfRows(userS);
    expect(c.primary_email).toBe(ES);
    // full_name defaults to the email local-part at signup → first_name.
    expect(c.first_name).toBe(ES.split("@")[0]);
    expect(c.source).toBe("self");
  });

  it("is visible to its owner via RLS", async () => {
    const { data } = await clientS.from("contacts").select("id").eq("user_id", userS);
    expect((data ?? []).length).toBe(1);
  });

  it("is NOT visible to other users", async () => {
    const { data } = await clientO.from("contacts").select("id").eq("owner_id", userS);
    expect((data ?? []).length).toBe(0);
  });

  it("the partial unique index blocks a second self-contact", async () => {
    const { error } = await admin
      .from("contacts")
      .insert({ owner_id: userS, user_id: userS, first_name: "Dup" });
    expect(error).not.toBeNull();
  });
});
