import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * GET    /api/v1/tools/:slug           — full tool + current version scripts
 * PATCH  /api/v1/tools/:slug  { ...fields, code?, bump_version? }
 *                                       — edit metadata and optionally publish
 *                                         a new version
 * DELETE /api/v1/tools/:slug           — soft delete
 */

async function handleGet(_req: NextRequest, { params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data: toolData } = await supabase
    .from("tools")
    .select(
      "id, slug, name, description, visibility, approval_mode, input_schema, output_schema, current_version, tags, timeout_seconds, owner_user_id, owner_space_id, created_at, updated_at",
    )
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!toolData) return notFound();
  const tool = toolData as { id: string; current_version: string };

  const { data: versionData } = await supabase
    .from("tool_versions")
    .select("id, version, runtime, entrypoint, scripts, published, published_at")
    .eq("tool_id", tool.id)
    .eq("version", tool.current_version)
    .maybeSingle();

  return NextResponse.json({
    data: {
      ...(toolData as Record<string, unknown>),
      current: versionData,
    },
  });
}

async function handlePatch(request: NextRequest, { params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    input_schema?: Record<string, unknown>;
    output_schema?: Record<string, unknown>;
    tags?: string[];
    timeout_seconds?: number;
    visibility?: "private" | "org" | "project" | "public";
    code?: string;
    bump_version?: boolean;
  };

  const { data: toolData } = await supabase
    .from("tools")
    .select("id, owner_user_id, current_version")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!toolData) return notFound();
  const tool = toolData as {
    id: string;
    owner_user_id: string;
    current_version: string;
  };
  if (tool.owner_user_id !== user.id) return forbidden();

  const patch: Record<string, unknown> = {};
  if (body.name) patch.name = body.name;
  if (body.description) patch.description = body.description;
  if (body.input_schema) patch.input_schema = body.input_schema;
  if (body.output_schema !== undefined)
    patch.output_schema = body.output_schema;
  if (Array.isArray(body.tags)) patch.tags = body.tags;
  if (typeof body.timeout_seconds === "number")
    patch.timeout_seconds = Math.min(30, Math.max(1, body.timeout_seconds));
  if (body.visibility) patch.visibility = body.visibility;

  // Publish a new version if code changed.
  if (typeof body.code === "string" && body.code.trim()) {
    const bump = body.bump_version !== false;
    const next = bump ? bumpPatch(tool.current_version) : tool.current_version;
    const { error } = await supabase
      .from("tool_versions")
      // @ts-expect-error generated insert collapses to never
      .insert({
        tool_id: tool.id,
        version: next,
        runtime: "node20",
        entrypoint: "index.js",
        scripts: { "index.js": body.code },
        skill_md: body.description
          ? `# ${body.name ?? slug}\n\n${body.description}`
          : `# ${body.name ?? slug}`,
        published: true,
        published_at: new Date().toISOString(),
        published_by: user.id,
      });
    if (error) {
      if (error.code === "23505")
        return conflict(`version ${next} already exists`);
      return internal(error.message);
    }
    patch.current_version = next;
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase
      .from("tools")
      // @ts-expect-error generated update collapses to never
      .update(patch)
      .eq("id", tool.id);
    if (error) return internal(error.message);
  }

  return NextResponse.json({ data: { slug, ...patch } });
}

async function handleDelete(_req: NextRequest, { params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data: row } = await supabase
    .from("tools")
    .select("id, owner_user_id")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  if (!row) return notFound();
  const tool = row as { id: string; owner_user_id: string };
  if (tool.owner_user_id !== user.id) return forbidden();

  const { error } = await supabase
    .from("tools")
    // @ts-expect-error generated update collapses to never
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", tool.id);
  if (error) return internal(error.message);
  return new NextResponse(null, { status: 204 });
}

function bumpPatch(v: string): string {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return "1.0.1";
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Not found" }] },
    { status: 404 },
  );
}
function forbidden() {
  return NextResponse.json(
    { errors: [{ code: "forbidden", message: "Only the owner can edit" }] },
    { status: 403 },
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

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/tools/:slug",
);
export const PATCH = withObservability<Props>(
  handlePatch,
  "PATCH /api/v1/tools/:slug",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/tools/:slug",
);
