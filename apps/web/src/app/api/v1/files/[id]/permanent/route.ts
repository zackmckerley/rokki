import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { deleteObject } from "@/lib/storage";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * DELETE /api/v1/files/:id/permanent — delete the bytes from storage and
 * remove the row from the DB. Only callable on files that are already in the
 * trash (deleted_at IS NOT NULL) to prevent accidental skipping of the bin.
 * RLS still enforces uploader-or-manager.
 */
export async function DELETE(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data } = await supabase
    .from("files")
    .select("id, terminal_id, blob_key, filename, deleted_at")
    .eq("id", id)
    .maybeSingle();

  const file = data as
    | {
        id: string;
        terminal_id: string;
        blob_key: string;
        filename: string;
        deleted_at: string | null;
      }
    | null;
  if (!file) return notFound();

  if (!file.deleted_at) {
    return bad(
      "file must be trashed first (soft-delete, then permanent); this prevents accidental hard deletes",
    );
  }

  // Best-effort storage purge
  try {
    await deleteObject(file.blob_key);
  } catch (e) {
    console.error("[files.permanent] storage delete failed:", e);
    // Fall through — we still remove the DB row so the user can't see it.
    // A janitor job sweeps orphaned blobs.
  }

  // Log before DB removal so we keep the paper trail even after the row is gone
  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: file.terminal_id,
      actor_id: user.id,
      action: "file.delete",
      entity_type: "file",
      entity_id: id,
      metadata: { filename: file.filename, permanent: true },
    });

  const { error } = await supabase.from("files").delete().eq("id", id);
  if (error) return internal(error.message);

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
