import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildBlobKey, copyObject } from "@/lib/storage";
import crypto from "node:crypto";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/files/:id/duplicate  { folder?, filename? }
 *
 * Creates a new files row pointing at a fresh blob key whose bytes are
 * server-side-copied from the source. Neither the app nor the client streams
 * the payload. Destination defaults to the source's folder and "(copy)"-suffixed
 * filename; both can be overridden.
 */
async function handlePost(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    folder?: string;
    filename?: string;
  };

  const { data } = await supabase
    .from("files")
    .select(
      "id, terminal_id, folder, filename, mime_type, size_bytes, blob_key, visibility, sha256, virus_scan_status",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  const src = data as
    | {
        id: string;
        terminal_id: string;
        folder: string;
        filename: string;
        mime_type: string;
        size_bytes: number;
        blob_key: string;
        visibility: "project" | "owners" | "custom";
        sha256: string | null;
        virus_scan_status: "pending" | "clean" | "infected" | "skipped";
      }
    | null;
  if (!src) return notFound();
  // Never duplicate a virus-flagged (or not-yet-scanned) file — otherwise the
  // copy inherited virus_scan_status:'skipped' and became downloadable.
  if (src.virus_scan_status === "infected")
    return NextResponse.json(
      { errors: [{ code: "virus_detected", message: "Cannot duplicate a file flagged by virus scanning." }] },
      { status: 403 },
    );
  if (src.virus_scan_status === "pending")
    return NextResponse.json(
      { errors: [{ code: "scan_pending", message: "File is still being scanned; try again shortly." }] },
      { status: 202 },
    );

  const destFolder = body.folder ?? src.folder;
  if (destFolder !== "/" && destFolder !== src.folder) {
    const { data: folderRow } = await supabase
      .from("folders")
      .select("id")
      .eq("terminal_id", src.terminal_id)
      .eq("path", destFolder)
      .is("deleted_at", null)
      .maybeSingle();
    if (!folderRow) return bad(`destination folder ${destFolder} does not exist`);
  }

  const destName = body.filename?.trim() || suffixCopy(src.filename);

  const newId = crypto.randomUUID();
  const newBlobKey = buildBlobKey({
    projectId: src.terminal_id,
    fileId: newId,
    version: 1,
  });

  try {
    await copyObject(src.blob_key, newBlobKey);
  } catch (e) {
    console.error("[files.duplicate] copy error:", e);
    return internal(
      e instanceof Error ? `copy failed: ${e.message}` : "copy failed",
    );
  }

  const result = await supabase
    .from("files")
    // @ts-expect-error Phase 0 — insert type collapses to never
    .insert({
      id: newId,
      terminal_id: src.terminal_id,
      folder: destFolder,
      filename: destName,
      mime_type: src.mime_type,
      size_bytes: src.size_bytes,
      blob_key: newBlobKey,
      visibility: src.visibility,
      version: 1,
      // Carry the source's (clean/skipped) status — infected/pending were
      // already rejected above — instead of blindly marking the copy skipped.
      virus_scan_status: src.virus_scan_status,
      sha256: src.sha256,
      uploaded_by: user.id,
    })
    .select("id, filename, folder, mime_type, size_bytes, uploaded_at")
    .single();

  const resultData = result.data as
    | { id: string; filename: string; folder: string; mime_type: string; size_bytes: number; uploaded_at: string }
    | null;
  if (result.error || !resultData) {
    return internal(result.error?.message ?? "insert failed");
  }

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — insert type collapses to never
    .insert({
      terminal_id: src.terminal_id,
      actor_id: user.id,
      action: "file.upload",
      entity_type: "file",
      entity_id: newId,
      metadata: {
        filename: destName,
        duplicated_from: src.id,
        folder: destFolder,
      },
    });

  return NextResponse.json({ data: resultData }, { status: 201 });
}

function suffixCopy(name: string): string {
  // Insert " (copy)" before the extension. "foo.pdf" → "foo (copy).pdf".
  const idx = name.lastIndexOf(".");
  if (idx <= 0 || idx === name.length - 1) return `${name} (copy)`;
  return `${name.slice(0, idx)} (copy)${name.slice(idx)}`;
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

export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/files/:id/duplicate",
);
