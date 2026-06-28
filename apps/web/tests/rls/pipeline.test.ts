/**
 * RLS tests for the pipeline tables (`pl_pipelines`, `pl_leads`).
 *
 * Verifies the policies from `20260628130000_pipeline_init.sql`: pipelines and
 * leads are space-scoped — visible/writable only to members of the owning
 * space; a non-member can't read them, and WITH CHECK blocks creating one in a
 * space you don't belong to. Mirrors tests/rls/markets.test.ts plumbing.
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
  expect(rows.length).toBe(1);
  return rows[0].id;
}

describe("RLS — pipeline (pl_*)", () => {
  let spaceA: string; // a space userA belongs to and userB does not
  let spaceB: string;
  let userA: string;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;

  beforeAll(async () => {
    userA = await ensureUser("pl-rls-a@rokki.local");
    const userB = await ensureUser("pl-rls-b@rokki.local");
    spaceA = await personalSpaceOf(userA);
    spaceB = await personalSpaceOf(userB);
    clientA = await makeClientFor("pl-rls-a@rokki.local");
    clientB = await makeClientFor("pl-rls-b@rokki.local");
  }, 30_000);

  let pipelineId: string;
  let leadId: string;
  let contactId: string;

  it("a member can create a pipeline in their space", async () => {
    const { data, error } = await clientA
      .from("pl_pipelines")
      .insert({ space_id: spaceA, name: "HELIOS" })
      .select("id")
      .single();
    expect(error).toBeNull();
    pipelineId = (data as { id: string }).id;
  });

  it("a non-member cannot see another space's pipeline", async () => {
    const { data } = await clientB
      .from("pl_pipelines")
      .select("id")
      .eq("id", pipelineId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("a user cannot create a pipeline in a space they're not in (WITH CHECK)", async () => {
    const { error } = await clientB
      .from("pl_pipelines")
      .insert({ space_id: spaceA, name: "intruder" });
    expect(error).toBeTruthy();
  });

  it("a member can create a lead in their space", async () => {
    const { data, error } = await clientA
      .from("pl_leads")
      .insert({
        pipeline_id: pipelineId,
        space_id: spaceA,
        name: "2510 SW 16 St",
        stage: "tracking",
      })
      .select("id")
      .single();
    expect(error).toBeNull();
    leadId = (data as { id: string }).id;
  });

  it("a non-member cannot see another space's lead", async () => {
    const { data } = await clientB
      .from("pl_leads")
      .select("id")
      .eq("id", leadId)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("a user cannot create a lead in a space they're not in (WITH CHECK)", async () => {
    const { error } = await clientB
      .from("pl_leads")
      .insert({ pipeline_id: pipelineId, space_id: spaceA, name: "intruder" });
    expect(error).toBeTruthy();
    expect(spaceB).toBeTruthy();
  });

  it("a member can link a contact to a lead", async () => {
    const { data: c } = await admin
      .from("contacts")
      .insert({
        owner_id: userA,
        first_name: "Linked",
        primary_email: "linked-pl@rokki.local",
        emails: [{ email: "linked-pl@rokki.local", primary: true }],
      })
      .select("id")
      .single();
    contactId = (c as { id: string }).id;
    const { error } = await clientA
      .from("pl_lead_contacts")
      .insert({ lead_id: leadId, contact_id: contactId, role: "owner" });
    expect(error).toBeNull();
  });

  it("promote_lead_to_terminal creates the terminal, carries contacts, converts the lead", async () => {
    const { data, error } = await clientA.rpc("promote_lead_to_terminal", {
      p_lead_id: leadId,
      p_ticker: "DEALX1",
    });
    expect(error).toBeNull();
    const rows = (data ?? []) as { terminal_id: string }[];
    expect(rows.length).toBe(1);
    const terminalId = rows[0].terminal_id;

    // terminal created in the lead's space
    const { data: term } = await admin
      .from("terminals")
      .select("id, space_id, ticker")
      .eq("id", terminalId)
      .single();
    expect((term as { space_id: string }).space_id).toBe(spaceA);

    // the linked contact was carried onto the terminal
    const { data: tc } = await admin
      .from("terminal_contacts")
      .select("contact_id")
      .eq("terminal_id", terminalId);
    expect((tc as { contact_id: string }[]).map((r) => r.contact_id)).toContain(contactId);

    // the lead is now converted + points at the terminal
    const { data: lead } = await admin
      .from("pl_leads")
      .select("status, promoted_terminal_id")
      .eq("id", leadId)
      .single();
    expect((lead as { status: string }).status).toBe("converted");
    expect((lead as { promoted_terminal_id: string }).promoted_terminal_id).toBe(terminalId);
  });

  it("promote is idempotent — a second promote is rejected", async () => {
    const { error } = await clientA.rpc("promote_lead_to_terminal", {
      p_lead_id: leadId,
      p_ticker: "DEALX2",
    });
    expect(error).toBeTruthy();
  });

  it("a non-member cannot promote another space's lead", async () => {
    const { error } = await clientB.rpc("promote_lead_to_terminal", {
      p_lead_id: leadId,
      p_ticker: "DEALX3",
    });
    expect(error).toBeTruthy();
  });
});
