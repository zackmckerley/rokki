import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildBlobKey, putObject } from "@/lib/storage";
import crypto from "node:crypto";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * GET  /api/v1/projects/:ticker/files       — list files visible to caller
 * POST /api/v1/projects/:ticker/files       — multipart upload (≤ 25 MB)
 *
 * Phase 1: small uploads only. Large-file signed-URL flow ships next slice.
 * No virus scan, no folder support, no versioning UX in v1.
 */
export async function GET(request: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const project = await resolveProject(supabase, ticker);
  if (!project) return notFound();

  const url = new URL(request.url);
  const showTrash = url.searchParams.get("trash") === "1";
  const folder = url.searchParams.get("folder");

  let query = supabase
    .from("files")
    .select(
      "id, filename, folder, mime_type, size_bytes, visibility, visibility_roles, visibility_users, version, virus_scan_status, uploaded_at, uploaded_by, deleted_at",
    )
    .eq("terminal_id", project.id);

  if (showTrash) {
    query = query.not("deleted_at", "is", null);
  } else {
    query = query.is("deleted_at", null);
    if (folder !== null) query = query.eq("folder", folder || "/");
  }

  const { data, error } = await query.order(
    showTrash ? "deleted_at" : "uploaded_at",
    { ascending: false },
  );

  if (error) return internal(error.message);
  return NextResponse.json({ data });
}

export async function POST(request: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const project = await resolveProject(supabase, ticker);
  if (!project) return notFound();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return bad("expected multipart/form-data");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return bad("missing 'file' field");
  if (file.size === 0) return bad("empty file");
  if (file.size > MAX_UPLOAD_BYTES)
    return payloadTooLarge(
      `file exceeds ${MAX_UPLOAD_BYTES / 1024 / 1024} MB; use the signed-URL flow (coming soon)`,
    );

  const visibility =
    (form.get("visibility")?.toString() as
      | "project"
      | "owners"
      | "custom"
      | undefined) ?? "project";

  // Folder must exist (or be root "/") for this project
  const requestedFolder = form.get("folder")?.toString()?.trim() || "/";
  if (requestedFolder !== "/") {
    const { data: folderRow } = await supabase
      .from("folders")
      .select("id")
      .eq("terminal_id", project.id)
      .eq("path", requestedFolder)
      .is("deleted_at", null)
      .maybeSingle();
    if (!folderRow) return bad(`folder ${requestedFolder} not found`);
  }

  // Generate an ID up front so we can build a stable blob key before inserting
  const fileId = crypto.randomUUID();
  const blobKey = buildBlobKey({
    projectId: project.id,
    fileId,
    version: 1,
  });

  const body = new Uint8Array(await file.arrayBuffer());

  let sha256: string;
  try {
    ({ sha256 } = await putObject({
      key: blobKey,
      body,
      contentType: file.type || "application/octet-stream",
      contentLength: file.size,
    }));
  } catch (e) {
    console.error("[files.upload] storage error:", e);
    const msg =
      e instanceof Error
        ? `${e.name}: ${e.message}`
        : typeof e === "object"
          ? JSON.stringify(e)
          : String(e);
    return internal(`storage upload failed — ${msg}`);
  }

  const result = await supabase
    .from("files")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      id: fileId,
      terminal_id: project.id,
      folder: requestedFolder,
      filename: file.name.slice(0, 300),
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      blob_key: blobKey,
      visibility,
      version: 1,
      // The indexer's scan loop flips this to 'clean' or 'infected'. If the
      // deployment has no ClamAV container (CLAMAV_HOST unset), the loop
      // auto-marks new files 'skipped' after a grace period so the indexer
      // doesn't stall.
      virus_scan_status: "pending",
      sha256,
      uploaded_by: user.id,
    })
    .select(
      "id, filename, mime_type, size_bytes, visibility, version, uploaded_at",
    )
    .single();

  const data = result.data as
    | {
        id: string;
        filename: string;
        mime_type: string;
        size_bytes: number;
      }
    | null;

  if (result.error || !data) {
    return internal(result.error?.message ?? "insert failed");
  }

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: project.id,
      space_id: project.space_id,
      actor_id: user.id,
      action: "file.upload",
      entity_type: "file",
      entity_id: data.id,
      metadata: {
        filename: data.filename,
        size_bytes: data.size_bytes,
      },
    });

  return NextResponse.json({ data }, { status: 201 });
}

async function resolveProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticker: string,
) {
  const { data } = await supabase
    .from("terminals")
    .select("id, space_id, ticker")
    .eq("ticker", ticker.toUpperCase())
    .is("archived_at", null)
    .maybeSingle();
  return data as { id: string; space_id: string; ticker: string } | null;
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
function payloadTooLarge(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "payload_too_large", message: msg }] },
    { status: 413 },
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
