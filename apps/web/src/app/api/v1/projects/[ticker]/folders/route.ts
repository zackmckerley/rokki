import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import {
  isValidFolderName,
  joinPath,
  normalizePath,
} from "@/lib/folder-path";

interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * GET  /api/v1/projects/:ticker/folders              — all folders in the space
 * POST /api/v1/projects/:ticker/folders  { name, parent? }
 *                                                    — create a new folder
 */
async function handleGet(_req: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const project = await resolveProject(supabase, ticker);
  if (!project) return notFound();

  const { data, error } = await supabase
    .from("folders")
    .select("id, path, name, parent_path, created_at, created_by")
    .eq("terminal_id", project.id)
    .is("deleted_at", null)
    .order("path", { ascending: true });

  if (error) return internal(error.message);
  return NextResponse.json({ data });
}

async function handlePost(request: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const project = await resolveProject(supabase, ticker);
  if (!project) return notFound();

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    parent?: string;
  };

  if (!body.name || !isValidFolderName(body.name.trim()))
    return bad(
      "folder name must be 1–60 chars (letters, digits, spaces, -_.&())",
    );

  const parent = normalizePath(body.parent ?? "/");
  const name = body.name.trim();
  const path = joinPath(parent, name);

  // If parent isn't root, it must exist (or be root)
  if (parent !== "/") {
    const { data: parentRow } = await supabase
      .from("folders")
      .select("id")
      .eq("terminal_id", project.id)
      .eq("path", parent)
      .is("deleted_at", null)
      .maybeSingle();
    if (!parentRow) return bad("parent folder not found");
  }

  const result = await supabase
    .from("folders")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: project.id,
      path,
      name,
      parent_path: parent,
      created_by: user.id,
    })
    .select("id, path, name, parent_path, created_at")
    .single();

  if (result.error) {
    if (result.error.code === "23505")
      return conflict("a folder with that name already exists here");
    return internal(result.error.message);
  }

  return NextResponse.json({ data: result.data }, { status: 201 });
}

async function resolveProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticker: string,
) {
  const { data } = await supabase
    .from("terminals")
    .select("id, space_id")
    .eq("ticker", ticker.toUpperCase())
    .is("archived_at", null)
    .maybeSingle();
  return data as { id: string; space_id: string } | null;
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
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Space not found" }] },
    { status: 404 },
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
  "GET /api/v1/projects/:ticker/folders",
);
export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/projects/:ticker/folders",
);
