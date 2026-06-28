/**
 * RLS tests for the contacts tables (`contacts`, `interactions`).
 *
 * Runs against the local Supabase stack (CI spins it up via `supabase db
 * reset`). Verifies the policies from `20260628120000_contacts_init.sql`:
 *
 *   - contacts — strictly owner-scoped (owner_id = auth.uid()); a non-owner
 *     can't read another user's contact, and WITH CHECK blocks creating one
 *     owned by someone else.
 *   - interactions — readable by the owner/creator (and space members /
 *     own-contact links); WITH CHECK blocks forging owner_id/created_by.
 *
 * Mirrors tests/rls/markets.test.ts for the auth/session plumbing.
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

describe("RLS — contacts", () => {
  let userA: string;
  let userB: string;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  beforeAll(async () => {
    userA = await ensureUser("contacts-rls-a@rokki.local");
    userB = await ensureUser("contacts-rls-b@rokki.local");
    clientA = await makeClientFor("contacts-rls-a@rokki.local");
    clientB = await makeClientFor("contacts-rls-b@rokki.local");
  }, 30_000);

  // ----- contacts: strictly owner-scoped -----
  let contactId: string;

  it("owner can create a contact", async () => {
    const { data, error } = await clientA
      .from("contacts")
      .insert({ owner_id: userA, first_name: "Broker", last_name: "Jones" })
      .select("id")
      .single();
    expect(error).toBeNull();
    contactId = (data as { id: string }).id;
  });

  it("owner sees their own contact", async () => {
    const { data, error } = await clientA
      .from("contacts")
      .select("id")
      .eq("id", contactId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  it("another user cannot see someone else's contact", async () => {
    const { data } = await clientB
      .from("contacts")
      .select("id")
      .eq("id", contactId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("a user cannot create a contact owned by someone else (WITH CHECK)", async () => {
    const { error } = await clientB
      .from("contacts")
      .insert({ owner_id: userA, first_name: "Forged" });
    expect(error).toBeTruthy();
  });

  it("a name is required (CHECK constraint)", async () => {
    const { error } = await clientA
      .from("contacts")
      .insert({ owner_id: userA, first_name: "", last_name: "" });
    expect(error).toBeTruthy();
  });

  // ----- interactions: owner/creator scoped -----
  let interactionId: string;

  it("owner can log an interaction", async () => {
    const { data, error } = await clientA
      .from("interactions")
      .insert({
        owner_id: userA,
        created_by: userA,
        contact_id: contactId,
        type: "note",
        body: "Called about the parcel.",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    interactionId = (data as { id: string }).id;
  });

  it("another user cannot read someone else's interaction", async () => {
    const { data } = await clientB
      .from("interactions")
      .select("id")
      .eq("id", interactionId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("a user cannot forge an interaction owned by someone else (WITH CHECK)", async () => {
    const { error } = await clientB
      .from("interactions")
      .insert({ owner_id: userA, created_by: userA, type: "note", body: "forged" });
    expect(error).toBeTruthy();
  });
});
