import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isValidFolderName, joinPath, parentOf } from "@/lib/folder-path";
import type { Database } from "@rokki/db";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH  /api/v1/folders/:id  { name }  — rename. Cascades to subfolders + files.
 * DELETE /api/v1/folders/:id             — soft delete. Descendant folders and
 *   contained files have their `deleted_at` set. Bytes preserved (recoverable
 *   via Trash in a future slice).
 *
 * Cascades run through the service-role client because the caller's RLS only
 * grants update on their own files/folders, not on every descendant.
 */
async function handlePatch(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  if (!body.name || !isValidFolderName(body.name.trim()))
    return bad("folder name must be 1–60 chars (letters, digits, spaces, -_.&())");
  const newName = body.name.trim();

  const { data: folderData } = await supabase
    .from("folders")
    .select("id, terminal_id, path, parent_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const folder = folderData as
    | { id: string; terminal_id: string; path: string; parent_path: string }
    | null;
  if (!folder) return notFound();

  const newPath = joinPath(folder.parent_path, newName);
  if (newPath === folder.path) {
    return NextResponse.json({ data: folder });
  }

  // Service role cascades — we've authorized the rename via the caller's RLS
  // check on this specific folder row.
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const old = folder.path;
  const oldPrefix = old + "/";
  const newPrefix = newPath + "/";

  // Conflict check: is there already a folder at newPath?
  const { data: conflictRow } = await admin
    .from("folders")
    .select("id")
    .eq("terminal_id", folder.terminal_id)
    .eq("path", newPath)
    .is("deleted_at", null)
    .maybeSingle();
  if (conflictRow) return conflict("a folder with that name already exists");

  try {
    // 1. Update the folder itself
    await admin
      .from("folders")
      .update({ path: newPath, name: newName })
      .eq("id", id);

    // 2. Update every descendant folder's path + parent_path
    const { data: descendants } = await admin
      .from("folders")
      .select("id, path, parent_path")
      .eq("terminal_id", folder.terminal_id)
      .is("deleted_at", null)
      .like("path", `${oldPrefix}%`);

    type FolderDescendant = { id: string; path: string; parent_path: string };
    for (const row of (descendants ?? []) as FolderDescendant[]) {
      await admin
        .from("folders")
        .update({
          path: newPrefix + row.path.slice(oldPrefix.length),
          parent_path:
            row.parent_path === old
              ? newPath
              : row.parent_path.startsWith(oldPrefix)
                ? newPrefix + row.parent_path.slice(oldPrefix.length)
                : row.parent_path,
        })
        .eq("id", row.id);
    }

    // 3. Update every file whose folder matches old path or starts with oldPrefix
    const { data: files } = await admin
      .from("files")
      .select("id, folder")
      .eq("terminal_id", folder.terminal_id)
      .or(`folder.eq.${old},folder.like.${oldPrefix}%`);

    type FileDescendant = { id: string; folder: string };
    for (const row of (files ?? []) as FileDescendant[]) {
      const nextFolder =
        row.folder === old
          ? newPath
          : newPrefix + row.folder.slice(oldPrefix.length);
      await admin
        .from("files")
        .update({ folder: nextFolder })
        .eq("id", row.id);
    }
  } catch (e) {
    return internal(
      e instanceof Error ? `rename cascade failed: ${e.message}` : "rename failed",
    );
  }

  return NextResponse.json({
    data: { id: folder.id, path: newPath, name: newName, parent_path: folder.parent_path },
  });
}

async function handleDelete(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data: folderData } = await supabase
    .from("folders")
    .select("id, terminal_id, path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const folder = folderData as
    | { id: string; terminal_id: string; path: string }
    | null;
  if (!folder) return notFound();

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const stamp = new Date().toISOString();
  const prefix = folder.path + "/";

  try {
    // Soft-delete this folder + descendants + contained files
    await admin
      .from("folders")
      .update({ deleted_at: stamp })
      .eq("id", id);

    await admin
      .from("folders")
      .update({ deleted_at: stamp })
      .eq("terminal_id", folder.terminal_id)
      .is("deleted_at", null)
      .like("path", `${prefix}%`);

    await admin
      .from("files")
      .update({ deleted_at: stamp })
      .eq("terminal_id", folder.terminal_id)
      .is("deleted_at", null)
      .or(`folder.eq.${folder.path},folder.like.${prefix}%`);
  } catch (e) {
    return internal(
      e instanceof Error ? `delete cascade failed: ${e.message}` : "delete failed",
    );
  }

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: folder.terminal_id,
      actor_id: user.id,
      action: "file.delete",
      entity_type: "folder",
      entity_id: folder.id,
      metadata: { path: folder.path, cascade: true },
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
function conflict(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "conflict", message: msg }] },
    { status: 409 },
  );
}
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Folder not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const PATCH = withObservability<Props>(
  handlePatch,
  "PATCH /api/v1/folders/:id",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/folders/:id",
);
