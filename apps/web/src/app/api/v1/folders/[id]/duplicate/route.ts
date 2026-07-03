import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { buildBlobKey, copyObject } from "@/lib/storage";
import { joinPath } from "@/lib/folder-path";
import type { Database } from "@rokki/db";
import crypto from "node:crypto";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/folders/:id/duplicate
 *
 * Recursively copies a folder subtree: creates new folder rows with the same
 * shape under a sibling "(copy)" root, then copies every contained file's row
 * and blob. Uses service-role because the cascade touches many rows the caller
 * can't individually insert via RLS; entry is authorized by the caller's RLS
 * check on the source folder.
 */
async function handlePost(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data } = await supabase
    .from("folders")
    .select("id, terminal_id, path, name, parent_path")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const src = data as
    | {
        id: string;
        terminal_id: string;
        path: string;
        name: string;
        parent_path: string;
      }
    | null;
  if (!src) return notFound();

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Pick a non-conflicting destination name like "Chores (copy)", "Chores (copy 2)", …
  const destName = await nextAvailableName(
    admin,
    src.terminal_id,
    src.parent_path,
    `${src.name} (copy)`,
  );
  const destRoot = joinPath(src.parent_path, destName);

  // 1. Create the new root folder
  const { data: newRoot, error: rootErr } = await admin
    .from("folders")
    .insert({
      terminal_id: src.terminal_id,
      path: destRoot,
      name: destName,
      parent_path: src.parent_path,
      created_by: user.id,
    })
    .select("id, path, name, parent_path")
    .single();
  if (rootErr || !newRoot) return internal(rootErr?.message ?? "root insert failed");

  const oldPrefix = src.path + "/";
  const newPrefix = destRoot + "/";
  const rewritePath = (oldP: string) =>
    oldP === src.path
      ? destRoot
      : oldP.startsWith(oldPrefix)
        ? newPrefix + oldP.slice(oldPrefix.length)
        : oldP;

  // 2. Copy every descendant folder
  const { data: descendants } = await admin
    .from("folders")
    .select("id, path, name, parent_path")
    .eq("terminal_id", src.terminal_id)
    .is("deleted_at", null)
    .like("path", `${oldPrefix}%`);

  type FolderDescendant = {
    id: string;
    path: string;
    name: string;
    parent_path: string;
  };
  for (const row of (descendants ?? []) as FolderDescendant[]) {
    await admin.from("folders").insert({
      terminal_id: src.terminal_id,
      path: rewritePath(row.path),
      name: row.name,
      parent_path: rewritePath(row.parent_path),
      created_by: user.id,
    });
  }

  // 3. Copy every file — blob copy server-side + new DB row
  const { data: files } = await admin
    .from("files")
    .select(
      "id, folder, filename, mime_type, size_bytes, blob_key, visibility, visibility_users, visibility_roles, virus_scan_status, sha256",
    )
    .eq("terminal_id", src.terminal_id)
    .is("deleted_at", null)
    .or(`folder.eq.${src.path},folder.like.${oldPrefix}%`);

  type VisibilityRole =
    | "owner"
    | "manager"
    | "architect"
    | "gc"
    | "lender"
    | "family"
    | "guest";
  type FileToCopy = {
    id: string;
    folder: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    blob_key: string;
    visibility: "project" | "owners" | "custom";
    visibility_users: string[] | null;
    visibility_roles: VisibilityRole[] | null;
    virus_scan_status: "pending" | "clean" | "infected" | "skipped";
    sha256: string | null;
  };
  let copied = 0;
  let skippedInfected = 0;
  for (const f of (files ?? []) as FileToCopy[]) {
    // Never propagate a virus-flagged file — otherwise the copy inherited
    // virus_scan_status:'skipped' and became downloadable past the scanner.
    if (f.virus_scan_status === "infected") {
      skippedInfected++;
      continue;
    }
    const newId = crypto.randomUUID();
    const newKey = buildBlobKey({
      projectId: src.terminal_id,
      fileId: newId,
      version: 1,
    });
    try {
      await copyObject(f.blob_key, newKey);
    } catch (e) {
      console.error("[folders.duplicate] copy error for", f.filename, e);
      continue;
    }
    await admin.from("files").insert({
      id: newId,
      terminal_id: src.terminal_id,
      folder: rewritePath(f.folder),
      filename: f.filename,
      mime_type: f.mime_type,
      size_bytes: f.size_bytes,
      blob_key: newKey,
      visibility: f.visibility,
      // Preserve the custom-visibility scope — dropping these left 'custom'
      // files visible to no one (silent loss), and blanking them on a copy of
      // a re-scoped file would be a scope leak in the other direction.
      visibility_users: f.visibility_users ?? undefined,
      visibility_roles: f.visibility_roles ?? undefined,
      version: 1,
      // Carry the source's real scan status instead of laundering to 'skipped'.
      virus_scan_status: f.virus_scan_status,
      sha256: f.sha256,
      uploaded_by: user.id,
    });
    copied++;
  }

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — insert type collapses to never
    .insert({
      terminal_id: src.terminal_id,
      actor_id: user.id,
      action: "file.upload",
      entity_type: "folder",
      entity_id: newRoot.id,
      metadata: {
        duplicated_from: src.path,
        to: destRoot,
        files_copied: copied,
      },
    });

  return NextResponse.json(
    {
      data: {
        folder: newRoot,
        files_copied: copied,
      },
    },
    { status: 201 },
  );
}

type AdminClient = ReturnType<typeof createAdminClient<Database>>;

async function nextAvailableName(
  admin: AdminClient,
  projectId: string,
  parentPath: string,
  baseName: string,
): Promise<string> {
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? baseName : `${baseName} ${i + 1}`;
    const candidatePath = joinPath(parentPath, candidate);
    const { data } = await admin
      .from("folders")
      .select("id")
      .eq("terminal_id", projectId)
      .eq("path", candidatePath)
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${baseName} ${Date.now()}`;
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
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

export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/folders/:id/duplicate",
);
