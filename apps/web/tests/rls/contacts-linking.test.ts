/**
 * Tests for contact ↔ Rokki-user linking (20260628160000_contacts_user_linking.sql).
 *
 * Covers the four security-critical behaviours:
 *   1. auto-link on shared space — a join reconciles co-members' contacts by email;
 *   2. forge-prevention — link_contact_to_user only links on a real email match;
 *   3. suggestion scoping — contact_link_suggestions returns only the caller's
 *      own unlinked email-matched contacts;
 *   4. unlink — clears the caller's own link.
 * Mirrors tests/rls/pipeline.test.ts plumbing.
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

async function insertContact(ownerId: string, name: string, email: string): Promise<string> {
  const { data, error } = await admin
    .from("contacts")
    .insert({
      owner_id: ownerId,
      first_name: name,
      primary_email: email,
      emails: [{ email, primary: true }],
    })
    .select("id")
    .single();
  if (error) throw new Error(`insertContact: ${error.message}`);
  return (data as { id: string }).id;
}

async function userIdOf(contactId: string): Promise<string | null> {
  const { data } = await admin
    .from("contacts")
    .select("user_id")
    .eq("id", contactId)
    .single();
  return (data as { user_id: string | null }).user_id;
}

const EA = "link-a@rokki.local";
const EB = "link-b@rokki.local";
const EC = "link-c@rokki.local";

describe("contacts ↔ user linking", () => {
  let userA: string;
  let userB: string;
  let userC: string;
  let clientA: SupabaseClient;
  let contactForB: string; // A's contact whose email == B (will share a space)
  let contactForC: string; // A's contact whose email == C (no shared space)

  beforeAll(async () => {
    userA = await ensureUser(EA);
    userB = await ensureUser(EB);
    userC = await ensureUser(EC);
    clientA = await makeClientFor(EA);

    contactForB = await insertContact(userA, "Bee", EB);
    contactForC = await insertContact(userA, "Cee", EC);

    // A shared (non-personal) space A + B both belong to. Fresh slug per run.
    const slug = `link-test-${Math.random().toString(36).slice(2, 8)}`;
    const { data: sp, error: spErr } = await admin
      .from("spaces")
      .insert({ slug, name: "Link Test", created_by: userA })
      .select("id")
      .single();
    if (spErr) throw new Error(`space: ${spErr.message}`);
    const spaceId = (sp as { id: string }).id;

    // Add A, then B. The AFTER INSERT trigger on B reconciles A's contact-for-B.
    await admin.from("space_members").insert({ space_id: spaceId, user_id: userA, role: "owner" });
    await admin.from("space_members").insert({ space_id: spaceId, user_id: userB, role: "member" });
  }, 30_000);

  it("auto-links a contact when that person joins a shared space", async () => {
    expect(await userIdOf(contactForB)).toBe(userB);
  });

  it("does NOT auto-link someone you don't share a space with", async () => {
    expect(await userIdOf(contactForC)).toBeNull();
  });

  it("surfaces the unlinked email-match as a suggestion (only for the owner)", async () => {
    const { data, error } = await clientA.rpc("contact_link_suggestions");
    expect(error).toBeNull();
    const rows = (data ?? []) as { contact_id: string; user_id: string }[];
    const hitC = rows.find((r) => r.contact_id === contactForC);
    expect(hitC?.user_id).toBe(userC);
    // The already-linked contactForB must not appear.
    expect(rows.find((r) => r.contact_id === contactForB)).toBeUndefined();
  });

  it("refuses to link to an account whose email doesn't match (forge-block)", async () => {
    const { data } = await clientA.rpc("link_contact_to_user", {
      p_contact_id: contactForC,
      p_user_id: userB, // wrong user — C's email != B's email
    });
    expect(data).toBe(false);
    expect(await userIdOf(contactForC)).toBeNull();
  });

  it("links on a verified email match, then unlinks", async () => {
    const { data: linked } = await clientA.rpc("link_contact_to_user", {
      p_contact_id: contactForC,
      p_user_id: userC,
    });
    expect(linked).toBe(true);
    expect(await userIdOf(contactForC)).toBe(userC);

    await clientA.rpc("unlink_contact", { p_contact_id: contactForC });
    expect(await userIdOf(contactForC)).toBeNull();
  });
});
