import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ id: string }>;
}

type FileVisibility = "project" | "owners" | "custom";
type ProjectRole =
  | "owner"
  | "manager"
  | "architect"
  | "gc"
  | "lender"
  | "family"
  | "guest";
const VALID_VIS: FileVisibility[] = ["project", "owners", "custom"];
const VALID_ROLES: ProjectRole[] = [
  "owner",
  "manager",
  "architect",
  "gc",
  "lender",
  "family",
  "guest",
];

/**
 * PATCH  /api/v1/files/:id  { filename?, folder?, visibility?, visibility_roles?, visibility_users? }
 * DELETE /api/v1/files/:id
 *
 * Visibility modes:
 *   - "project"  — any member of the terminal can read
 *   - "owners"   — only the uploader and terminal owners/managers
 *   - "custom"   — the uploader, owners/managers, plus explicit role + user grants
 *
 * RLS enforces read access; this PATCH updates the declarative state. When
 * switching to a non-custom mode, the explicit arrays are cleared.
 */
export async function PATCH(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    filename?: string;
    folder?: string;
    visibility?: FileVisibility;
    visibility_roles?: ProjectRole[];
    visibility_users?: string[];
  };

  const { data: existing } = await supabase
    .from("files")
    .select("id, terminal_id, filename, folder")
    .eq("id", id)
    .maybeSingle();
  const file = existing as
    | { id: string; terminal_id: string; filename: string; folder: string }
    | null;
  if (!file) return notFound();

  const patch: Record<string, unknown> = {};

  if (body.filename !== undefined) {
    const trimmed = body.filename.trim();
    if (!trimmed || trimmed.length > 300)
      return bad("filename must be 1–300 characters");
    patch.filename = trimmed;
  }

  if (body.folder !== undefined) {
    const target = body.folder.trim();
    if (!target || !target.startsWith("/"))
      return bad("folder must start with /");
    if (target !== "/") {
      const { data: folderRow } = await supabase
        .from("folders")
        .select("id")
        .eq("terminal_id", file.terminal_id)
        .eq("path", target)
        .is("deleted_at", null)
        .maybeSingle();
      if (!folderRow) return bad(`folder ${target} does not exist`);
    }
    patch.folder = target;
  }

  if (body.visibility !== undefined) {
    if (!VALID_VIS.includes(body.visibility))
      return bad(`visibility must be one of ${VALID_VIS.join(", ")}`);
    patch.visibility = body.visibility;
    // Moving away from custom: clear grants so nothing lingers silently.
    if (body.visibility !== "custom") {
      patch.visibility_roles = [];
      patch.visibility_users = [];
    }
  }

  if (body.visibility_roles !== undefined) {
    if (!Array.isArray(body.visibility_roles))
      return bad("visibility_roles must be an array");
    const invalid = body.visibility_roles.find(
      (r) => !VALID_ROLES.includes(r as ProjectRole),
    );
    if (invalid) return bad(`unknown role: ${invalid}`);
    patch.visibility_roles = body.visibility_roles;
  }

  if (body.visibility_users !== undefined) {
    if (!Array.isArray(body.visibility_users))
      return bad("visibility_users must be an array");
    // Must all be valid UUIDs to avoid poisoning the array.
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const bad_ = body.visibility_users.find((u) => !UUID.test(u));
    if (bad_) return bad(`invalid user id: ${bad_}`);
    patch.visibility_users = body.visibility_users;
  }

  if (Object.keys(patch).length === 0) return bad("no changes provided");

  const { error } = await supabase
    .from("files")
    // @ts-expect-error Phase 0 — update type collapses to never
    .update(patch)
    .eq("id", id);
  if (error) return internal(`${error.code ?? "db"}: ${error.message}`);

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — insert type collapses to never
    .insert({
    terminal_id: file.terminal_id,
    actor_id: user.id,
    action: "file.update",
    entity_type: "file",
    entity_id: id,
    metadata: {
      filename_changed:
        patch.filename && patch.filename !== file.filename
          ? { from: file.filename, to: patch.filename }
          : undefined,
      folder_changed:
        patch.folder && patch.folder !== file.folder
          ? { from: file.folder, to: patch.folder }
          : undefined,
      visibility_changed: patch.visibility ? patch.visibility : undefined,
      visibility_roles_changed: patch.visibility_roles
        ? (patch.visibility_roles as string[]).length
        : undefined,
      visibility_users_changed: patch.visibility_users
        ? (patch.visibility_users as string[]).length
        : undefined,
    },
  });

  return NextResponse.json({ data: { id, ...patch } });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data } = await supabase
    .from("files")
    .select("id, terminal_id, filename")
    .eq("id", id)
    .maybeSingle();

  const file = data as
    | { id: string; terminal_id: string; filename: string }
    | null;
  if (!file) return notFound();

  const { error } = await supabase
    .from("files")
    // @ts-expect-error Phase 0 — update type collapses to never
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[files.delete] update error:", error);
    return internal(`${error.code ?? "db"}: ${error.message}`);
  }

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — insert type collapses to never
    .insert({
    terminal_id: file.terminal_id,
    actor_id: user.id,
    action: "file.delete",
    entity_type: "file",
    entity_id: id,
    metadata: { filename: file.filename, soft: true },
  });

  return new NextResponse(null, { status: 204 });
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
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "File not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}
