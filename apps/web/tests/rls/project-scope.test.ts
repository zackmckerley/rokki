/**
 * RLS smoke tests. Runs against the local Supabase stack.
 *
 *   - Signs in as zack@rokki.local and verifies project-scoped SELECTs.
 *   - Signs in as a non-member and verifies they can't see the project.
 *
 * These tests require supabase to be running locally (the CI job spins it
 * up). They're tagged with `tests/rls/*.test.ts` so the normal `pnpm test`
 * includes them. Skip them in a fast dev loop with
 * `vitest --exclude tests/rls/**`.
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
  // Generate a magic-link + verify it to mint a session. We don't need the
  // redirect to actually resolve — we just want the session tokens.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data) throw new Error(`generateLink failed: ${error?.message}`);
  const supabase = createClient(SB_URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: verifyData, error: verifyErr } =
    await supabase.auth.verifyOtp({
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

describe("RLS — project scoping", () => {
  let projectId: string | null = null;
  let zack: SupabaseClient;
  let stranger: SupabaseClient;

  beforeAll(async () => {
    // Make sure we have a project zack owns.
    const { data: users } = await admin.auth.admin.listUsers();
    const zackUser = users?.users.find((u) => u.email === "zack@rokki.local");
    if (!zackUser) {
      throw new Error("seed user zack@rokki.local missing — run db reset");
    }
    const strangerEmail = "rls-stranger@rokki.local";
    let strangerUser = users?.users.find((u) => u.email === strangerEmail);
    if (!strangerUser) {
      const { data } = await admin.auth.admin.createUser({
        email: strangerEmail,
        email_confirm: true,
      });
      strangerUser = data.user!;
    }

    // Seed a space + terminal with zack as owner, via service role — this
    // bypasses the platform-admin gate that applies to regular auth'd users.
    // Reuse any existing terminal so reruns are cheap.
    const { data: existing } = await admin
      .from("terminals")
      .select("id")
      .eq("created_by", zackUser.id)
      .is("archived_at", null)
      .limit(1);
    type P = { id: string };
    const found = ((existing ?? []) as P[])[0]?.id ?? null;

    if (found) {
      projectId = found;
    } else {
      // Create a parent space owned by zack.
      const { data: spaceRow, error: spaceErr } = await admin
        .from("spaces")
        .insert({
          slug: "rls-test-space-" + Math.random().toString(36).slice(2, 6),
          name: "RLS test space",
          created_by: zackUser.id,
        })
        .select("id")
        .single();
      if (spaceErr || !spaceRow) throw new Error(`space seed: ${spaceErr?.message}`);
      const spaceId = (spaceRow as { id: string }).id;

      // Promote zack to owner in the space (trigger may have already done this,
      // but make it explicit for clarity).
      await admin
        .from("space_members")
        .upsert(
          { space_id: spaceId, user_id: zackUser.id, role: "owner" },
          { onConflict: "space_id,user_id" },
        );

      const { data: termRow, error: termErr } = await admin
        .from("terminals")
        .insert({
          space_id: spaceId,
          ticker: "RLS",
          name: "RLS test terminal",
          type: "space",
          created_by: zackUser.id,
        })
        .select("id")
        .single();
      if (termErr || !termRow) throw new Error(`terminal seed: ${termErr?.message}`);
      projectId = (termRow as { id: string }).id;
    }
    expect(projectId).toBeTruthy();

    zack = await makeClientFor("zack@rokki.local");
    stranger = await makeClientFor(strangerEmail);
  }, 30_000);

  it("owner can read their own terminal", async () => {
    const { data, error } = await zack
      .from("terminals")
      .select("id, name")
      .eq("id", projectId!)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).toBeTruthy();
  });

  it("non-member cannot read a private terminal", async () => {
    const { data, error } = await stranger
      .from("terminals")
      .select("id")
      .eq("id", projectId!)
      .maybeSingle();
    // Either returns null (RLS filter) or errors; both satisfy the contract.
    expect(error ? true : data === null).toBe(true);
  });

  it("non-member cannot list tasks for a terminal they don't belong to", async () => {
    const { data } = await stranger
      .from("tasks")
      .select("id")
      .eq("terminal_id", projectId!);
    expect((data ?? []).length).toBe(0);
  });

  it("non-member cannot insert into that project's files", async () => {
    const { error } = await stranger.from("files").insert({
      terminal_id: projectId!,
      filename: "intruder.txt",
      folder: "/",
      mime_type: "text/plain",
      size_bytes: 0,
      blob_key: "ignored",
      uploaded_by: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).toBeTruthy();
  });

  it("user can read their own notifications only", async () => {
    // Seed a notification for zack and one for the stranger directly via admin.
    const {
      data: { user: zackUser },
    } = await zack.auth.getUser();
    const {
      data: { user: strangerUser },
    } = await stranger.auth.getUser();
    await admin.from("notifications").insert([
      {
        user_id: zackUser!.id,
        kind: "system",
        title: "For zack",
      },
      {
        user_id: strangerUser!.id,
        kind: "system",
        title: "For stranger",
      },
    ]);
    const { data: zackRows } = await zack
      .from("notifications")
      .select("title")
      .eq("user_id", zackUser!.id);
    expect((zackRows ?? []).some((r: { title: string }) => r.title === "For zack")).toBe(
      true,
    );
    // Zack shouldn't see the stranger's row.
    const { data: leak } = await zack
      .from("notifications")
      .select("title")
      .eq("user_id", strangerUser!.id);
    expect((leak ?? []).length).toBe(0);
  });
});
