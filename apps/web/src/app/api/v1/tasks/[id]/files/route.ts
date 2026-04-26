import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET    /api/v1/tasks/:id/files                 — list attached files (newest first)
 * POST   /api/v1/tasks/:id/files  { file_id }    — attach an existing file
 * DELETE /api/v1/tasks/:id/files?file_id=<uuid>  — detach
 *
 * Files must already exist in the same terminal — we never upload through
 * this route. Drag-drop in the UI calls POST after the file is in storage.
 */
async function handleGet(_req: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  // Two-step: read the join, then enrich with file metadata. RLS scopes
  // both queries to the caller, so a user who can't see the task gets an
  // empty list.
  const { data: links, error } = await supabase
    .from("task_files")
    .select("file_id, attached_at, attached_by")
    .eq("task_id", taskId)
    .order("attached_at", { ascending: false });
  if (error) return internal(error.message);

  const rows = (links ?? []) as {
    file_id: string;
    attached_at: string;
    attached_by: string;
  }[];
  if (rows.length === 0) return NextResponse.json({ data: [] });

  const fileIds = rows.map((r) => r.file_id);
  const { data: files } = await supabase
    .from("files")
    .select("id, filename, folder, mime_type, size_bytes, deleted_at")
    .in("id", fileIds);
  type F = {
    id: string;
    filename: string;
    folder: string;
    mime_type: string;
    size_bytes: number;
    deleted_at: string | null;
  };
  const byId = new Map(((files ?? []) as F[]).map((f) => [f.id, f]));

  return NextResponse.json({
    data: rows
      .map((r) => {
        const f = byId.get(r.file_id);
        if (!f || f.deleted_at) return null; // hide trashed files
        return {
          file_id: r.file_id,
          filename: f.filename,
          folder: f.folder,
          mime_type: f.mime_type,
          size_bytes: f.size_bytes,
          attached_at: r.attached_at,
          attached_by: r.attached_by,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  });
}

async function handlePost(request: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    file_id?: string;
  };
  if (!body.file_id) return bad("file_id is required");

  const { error } = await supabase
    .from("task_files")
    // @ts-expect-error generic insert collapses to never
    .insert({
      task_id: taskId,
      file_id: body.file_id,
      attached_by: user.id,
    });
  if (error) {
    if (error.code === "23505") return new NextResponse(null, { status: 204 }); // already attached
    return internal(error.message);
  }

  // Activity log — drop a file.attach row so the ticker reflects the link.
  const { data: task } = await supabase
    .from("tasks")
    .select("terminal_id, title")
    .eq("id", taskId)
    .maybeSingle();
  const t = task as { terminal_id: string; title: string } | null;
  if (t) {
    await supabase
      .from("activity")
      // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
      .insert({
        terminal_id: t.terminal_id,
        actor_id: user.id,
        action: "task.update",
        entity_type: "task",
        entity_id: taskId,
        metadata: { attached_file_id: body.file_id, title: t.title },
      });
  }
  return new NextResponse(null, { status: 204 });
}

async function handleDelete(request: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const fileId = new URL(request.url).searchParams.get("file_id");
  if (!fileId) return bad("file_id query param is required");

  const { error } = await supabase
    .from("task_files")
    .delete()
    .eq("task_id", taskId)
    .eq("file_id", fileId);
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
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const GET = withObservability<Props>(handleGet, "GET /api/v1/tasks/:id/files");
export const POST = withObservability<Props>(handlePost, "POST /api/v1/tasks/:id/files");
export const DELETE = withObservability<Props>(handleDelete, "DELETE /api/v1/tasks/:id/files");
