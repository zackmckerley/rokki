import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/files/:id/restore — un-trash a soft-deleted file.
 * Bytes are still in storage because the original delete was soft only.
 */
export async function POST(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data } = await supabase
    .from("files")
    .select("id, terminal_id, filename, deleted_at")
    .eq("id", id)
    .maybeSingle();

  const file = data as
    | {
        id: string;
        terminal_id: string;
        filename: string;
        deleted_at: string | null;
      }
    | null;
  if (!file) return notFound();
  if (!file.deleted_at) return bad("file is not in the trash");

  const { error } = await supabase
    .from("files")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .update({ deleted_at: null })
    .eq("id", id);
  if (error) return internal(error.message);

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: file.terminal_id,
      actor_id: user.id,
      action: "file.update",
      entity_type: "file",
      entity_id: id,
      metadata: { filename: file.filename, restored: true },
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
