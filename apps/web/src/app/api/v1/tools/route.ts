import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateBearer } from "@/lib/api-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";

/**
 * GET  /api/v1/tools                  — tools visible to the caller
 * POST /api/v1/tools  { name, slug?, description, input_schema, output_schema?,
 *                       code, timeout_seconds?, tags? }
 *                                     — register a new tool, publishes v1.0.0
 */
export async function GET(request: NextRequest) {
  const bearer = await validateBearer(request);

  let supabase: SupabaseClient<Database>;
  if (bearer) {
    supabase = bearer.admin;
  } else {
    supabase = (await createClient()) as unknown as SupabaseClient<Database>;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return unauth();
  }

  const { data, error } = await supabase
    .from("tools")
    .select(
      "id, slug, name, description, visibility, owner_user_id, owner_space_id, current_version, tags, timeout_seconds, created_at, updated_at",
    )
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) return internal(error.message);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  // Accept either a signed-in cookie session OR a personal access token
  // via Authorization: Bearer. The CLI uses Bearer; the web UI uses cookies.
  let supabase: SupabaseClient<Database>;
  let userId: string;
  const bearer = await validateBearer(request);
  if (bearer) {
    supabase = bearer.admin;
    userId = bearer.userId;
  } else {
    supabase = (await createClient()) as unknown as SupabaseClient<Database>;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return unauth();
    userId = user.id;
  }

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    slug?: string;
    description?: string;
    input_schema?: Record<string, unknown>;
    output_schema?: Record<string, unknown>;
    code?: string;
    timeout_seconds?: number;
    tags?: string[];
  };

  if (!body.name || !body.description || !body.code) {
    return bad("name, description, code required");
  }
  if (body.name.length > 120) return bad("name must be ≤ 120 chars");
  if (body.description.length < 10 || body.description.length > 2000)
    return bad("description must be 10–2000 chars");

  const slugRaw =
    body.slug?.trim().toLowerCase() ??
    body.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  if (!/^[a-z][a-z0-9-]{1,60}[a-z0-9]$/.test(slugRaw))
    return bad(
      "slug must be 3–62 chars, lowercase letters/digits/dashes, start with a letter",
    );

  // Pick the user's first org (UI can add an org picker later).
  const { data: memberships } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("user_id", userId);
  const orgId = ((memberships ?? []) as { space_id: string }[])[0]?.space_id;
  if (!orgId)
    return bad("You need to belong to an organization to publish a tool");

  const toolInsert = await supabase
    .from("tools")
    .insert({
      slug: slugRaw,
      owner_space_id: orgId,
      owner_user_id: userId,
      name: body.name,
      description: body.description,
      input_schema: body.input_schema ?? { type: "object" },
      output_schema: body.output_schema ?? null,
      visibility: "private",
      approval_mode: "auto",
      timeout_seconds: Math.min(
        30,
        Math.max(1, body.timeout_seconds ?? 10),
      ),
      memory_mb: 256,
      requires_providers: [],
      tags: body.tags ?? [],
    } as never)
    .select("id, slug, name, current_version")
    .single();
  if (toolInsert.error) {
    if (toolInsert.error.code === "23505")
      return conflict(`slug "${slugRaw}" is taken`);
    return internal(toolInsert.error.message ?? "insert failed");
  }
  const tool = toolInsert.data as { id: string; slug: string } | null;
  if (!tool) return internal("insert returned no row");

  const versionInsert = await supabase
    .from("tool_versions")
    .insert({
      tool_id: tool.id,
      version: "1.0.0",
      runtime: "node20",
      entrypoint: "index.js",
      scripts: { "index.js": body.code },
      skill_md: `# ${body.name}\n\n${body.description}`,
      published: true,
      published_at: new Date().toISOString(),
      published_by: userId,
    } as never)
    .select("id")
    .single();
  if (versionInsert.error || !versionInsert.data) {
    await supabase.from("tools").delete().eq("id", tool.id);
    return internal(versionInsert.error?.message ?? "version failed");
  }

  await supabase
    .from("tools")
    .update({ current_version: "1.0.0" } as never)
    .eq("id", tool.id);

  return NextResponse.json({ data: { id: tool.id, slug: tool.slug } }, { status: 201 });
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}
function conflict(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "conflict", message: msg }] },
    { status: 409 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}
