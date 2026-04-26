import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { mentionedUserIds } from "@/lib/mentions";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET  /api/v1/tasks/:id/comments
 *   → list active (non-deleted) comments on the task, oldest first.
 *
 * POST /api/v1/tasks/:id/comments  { body, parent_id? }
 *   → post a comment.
 *
 * Storage note: these wrap the existing public.comments table
 * (entity_type='task'). We deliberately did NOT add a separate
 * task_comments table — the existing one already supports tasks, files,
 * and projects via the entity_type discriminator, and the realtime + RLS
 * + mention-notification machinery is already wired.
 */
async function handleGet(_req: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data, error } = await supabase
    .from("comments")
    .select(
      "id, entity_type, entity_id, terminal_id, parent_id, body, mentions, created_at, edited_at, deleted_at, created_by",
    )
    .eq("entity_type", "task")
    .eq("entity_id", taskId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return internal(error.message);

  type R = {
    id: string;
    entity_type: string;
    entity_id: string;
    terminal_id: string;
    parent_id: string | null;
    body: string;
    mentions: string[];
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
    created_by: string;
  };
  const rows = (data ?? []) as R[];
  const authorIds = Array.from(new Set(rows.map((r) => r.created_by)));
  const { data: profiles } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", authorIds)
    : { data: [] };
  type P = { user_id: string; full_name: string | null; avatar_url: string | null };
  const byId = new Map(((profiles ?? []) as P[]).map((p) => [p.user_id, p]));

  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      author: byId.get(r.created_by)
        ? {
            user_id: r.created_by,
            full_name: byId.get(r.created_by)!.full_name,
            avatar_url: byId.get(r.created_by)!.avatar_url,
          }
        : { user_id: r.created_by, full_name: null, avatar_url: null },
    })),
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
    body?: string;
    parent_id?: string;
  };
  const content = (body.body ?? "").trim();
  if (content.length < 1 || content.length > 20_000)
    return bad("body must be 1–20,000 chars");

  // Resolve terminal_id for the comments row (FK + RLS need it).
  const { data: task } = await supabase
    .from("tasks")
    .select("terminal_id")
    .eq("id", taskId)
    .maybeSingle();
  const t = task as { terminal_id: string } | null;
  if (!t) return notFound();

  const mentions = mentionedUserIds(content);
  const result = (await supabase
    .from("comments")
    // @ts-expect-error generic insert collapses to never
    .insert({
      entity_type: "task",
      entity_id: taskId,
      terminal_id: t.terminal_id,
      parent_id: body.parent_id ?? null,
      body: content,
      mentions,
      created_by: user.id,
    })
    .select(
      "id, entity_type, entity_id, terminal_id, parent_id, body, mentions, created_at, created_by",
    )
    .single()) as { data: unknown; error: { message: string } | null };

  if (result.error || !result.data) {
    return internal(result.error?.message ?? "insert failed");
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
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
    { errors: [{ code: "not_found", message: "Task not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const GET = withObservability<Props>(handleGet, "GET /api/v1/tasks/:id/comments");
export const POST = withObservability<Props>(handlePost, "POST /api/v1/tasks/:id/comments");
