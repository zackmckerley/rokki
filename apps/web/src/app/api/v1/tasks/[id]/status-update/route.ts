import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import type { Database } from "@rokki/db";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/tasks/:id/status-update
 *
 * Records a status update on the task — sets `latest_status_*`
 * and (optionally) posts a paired message into the task's status
 * thread so the conversation history is honest.
 *
 * Authorization: caller must be an assignee on the task OR a
 * member of the parent terminal. Per Zack's spec the chip can be
 * edited inline by the requester or the assignee; this endpoint
 * is the single write path for both.
 *
 * Body:
 *   { text: string, post_to_thread?: boolean (default true) }
 *
 * Response:
 *   { data: { latest_status_text, latest_status_author_id, latest_status_at } }
 */
async function handlePost(request: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    post_to_thread?: boolean;
  };
  const text = (body.text ?? "").trim();
  if (!text) return bad("text is required");
  if (text.length > 2000) return bad("text must be ≤ 2000 characters");
  const postToThread = body.post_to_thread !== false;

  const { data: taskRow } = await supabase
    .from("tasks")
    .select("id, terminal_id, title, status_thread_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!taskRow) return notFound();
  const task = taskRow as {
    id: string;
    terminal_id: string;
    title: string;
    status_thread_id: string | null;
  };

  const { data: callerMembership } = await supabase
    .from("terminal_members")
    .select("user_id")
    .eq("terminal_id", task.terminal_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!callerMembership) {
    return forbidden("not a member of this terminal");
  }

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await admin
    .from("tasks")
    .update({
      latest_status_text: text,
      latest_status_author_id: user.id,
      latest_status_at: now,
    } as never)
    .eq("id", taskId)
    .select("latest_status_text, latest_status_author_id, latest_status_at")
    .single();
  if (updateErr || !updated) {
    return internal(updateErr?.message ?? "task update failed");
  }

  // Echo the status into the thread as a normal message so the
  // conversation reads naturally — and so the requester's
  // "Reply with status" button can be wired to call this endpoint
  // without leaving the messenger.
  if (postToThread && task.status_thread_id) {
    await admin
      .from("messages")
      .insert({
        thread_id: task.status_thread_id,
        author_id: user.id,
        body: `Status update: ${text}`,
        pinging_task_id: taskId,
      } as never);
    await admin
      .from("message_threads")
      .update({ last_message_at: now } as never)
      .eq("id", task.status_thread_id);

    // Notify everyone in the thread except the author so the
    // requester (and anyone else watching) gets a "status came
    // back" ping.
    const { data: participants } = await admin
      .from("thread_participants")
      .select("user_id")
      .eq("thread_id", task.status_thread_id);
    const recipients = ((participants ?? []) as { user_id: string }[])
      .map((r) => r.user_id)
      .filter((uid) => uid !== user.id);
    if (recipients.length > 0) {
      const { data: callerProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const callerName =
        (callerProfile as { full_name?: string | null } | null)?.full_name ??
        "Someone";
      await admin
        .from("notifications")
        .insert(
          recipients.map((uid) => ({
            user_id: uid,
            kind: "mention" as const,
            title: `${callerName} replied with a status update`,
            body: `"${task.title}" — ${text.slice(0, 280)}`,
            entity_type: "task",
            entity_id: taskId,
            terminal_id: task.terminal_id,
            actor_id: user.id,
            url: "/messages",
          })) as never,
        );
    }
  }

  return NextResponse.json({ data: updated }, { status: 200 });
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function forbidden(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "forbidden", message: msg }] },
    { status: 403 },
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

export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/tasks/:id/status-update",
);
