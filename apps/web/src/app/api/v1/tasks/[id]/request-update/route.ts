import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import type { Database } from "@rokki/db";

interface Props {
  params: Promise<{ id: string }>;
}

const TEMPLATE_BODY = "What is the status of this task?";

/**
 * POST /api/v1/tasks/:id/request-update
 *
 * Sends a "what's the status?" ping to the task's assignee(s) via
 * the messenger. Single assignee → DM thread (kind='dm'). Multiple
 * assignees → group chat (kind='group'). The requester is always
 * a participant so they can see replies.
 *
 * The status thread is persistent: subsequent calls reuse the
 * existing `tasks.status_thread_id` and only sync participants if
 * the assignee set has changed (e.g. task was reassigned).
 *
 * Each ping inserts a message with `pinging_task_id = task.id` so
 * the messenger inbox can render the "📌 task" chip + the "Reply
 * with status" button on the message.
 *
 * Response:
 *   { data: { thread_id, message_id, recipients: string[] } }
 */
async function handlePost(_req: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  // Load the task + verify visibility (RLS does the actual filter,
  // we just check the row resolved).
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

  // Caller must be a member of the parent terminal — this matches
  // the existing comment + assignee mutation policies.
  const { data: callerMembership } = await supabase
    .from("terminal_members")
    .select("user_id")
    .eq("terminal_id", task.terminal_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!callerMembership) {
    return forbidden("not a member of this terminal");
  }

  const { data: assigneeRows } = await supabase
    .from("task_assignees")
    .select("user_id")
    .eq("task_id", taskId);
  const assigneeIds = ((assigneeRows ?? []) as { user_id: string }[]).map(
    (r) => r.user_id,
  );
  if (assigneeIds.length === 0) {
    return bad("task has no assignees to ping");
  }
  if (
    assigneeIds.length === 1 &&
    assigneeIds[0] === user.id
  ) {
    return bad("you are the only assignee — nobody to ping");
  }

  // The thread participants are: requester ∪ assignees. Self-pings
  // collapse onto the assignee set (no duplication).
  const participantIds = Array.from(new Set([user.id, ...assigneeIds]));

  // Decide thread kind. 2 participants → DM. 3+ → group.
  const kind: "dm" | "group" = participantIds.length === 2 ? "dm" : "group";

  // Service-role client for the thread / participant inserts —
  // bypasses RLS on threads (which is intentionally restrictive
  // for non-channel kinds). Auditing happens via `actor_id` on
  // the message itself.
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Resolve (or lazily create) the persistent status thread for this
  // task. We compute `threadId` as a non-null string so the closure
  // captures below don't have to worry about narrowing through `let`.
  let threadId: string;
  if (task.status_thread_id) {
    threadId = task.status_thread_id;
    // Reuse existing thread; sync participants if the assignee set
    // changed since last ping (reassignment is the common case).
    const { data: currentParticipants } = await admin
      .from("thread_participants")
      .select("user_id")
      .eq("thread_id", threadId);
    const currentIds = new Set(
      ((currentParticipants ?? []) as { user_id: string }[]).map(
        (r) => r.user_id,
      ),
    );
    const desiredIds = new Set(participantIds);
    const toAdd = participantIds.filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !desiredIds.has(id));
    if (toAdd.length > 0) {
      const tid = threadId;
      await admin
        .from("thread_participants")
        .insert(
          toAdd.map((uid) => ({ thread_id: tid, user_id: uid })) as never,
        );
    }
    if (toRemove.length > 0) {
      await admin
        .from("thread_participants")
        .delete()
        .eq("thread_id", threadId)
        .in("user_id", toRemove);
    }
  } else {
    // Create new thread + seed participants.
    const { data: newThread, error: threadErr } = await admin
      .from("message_threads")
      .insert({ kind } as never)
      .select("id")
      .single();
    if (threadErr || !newThread) {
      return internal(threadErr?.message ?? "thread create failed");
    }
    threadId = (newThread as { id: string }).id;
    const tid = threadId;
    await admin
      .from("thread_participants")
      .insert(
        participantIds.map((uid) => ({
          thread_id: tid,
          user_id: uid,
        })) as never,
      );
    // Pin the thread back to the task so future calls reuse it.
    await admin
      .from("tasks")
      .update({ status_thread_id: threadId } as never)
      .eq("id", taskId);
  }

  // Insert the ping message itself with pinging_task_id set.
  const { data: msg, error: msgErr } = await admin
    .from("messages")
    .insert({
      thread_id: threadId,
      author_id: user.id,
      body: TEMPLATE_BODY,
      pinging_task_id: taskId,
    } as never)
    .select("id")
    .single();
  if (msgErr || !msg) {
    return internal(msgErr?.message ?? "message insert failed");
  }
  // Bump last_message_at so the thread surfaces in the inbox sort.
  await admin
    .from("message_threads")
    .update({ last_message_at: new Date().toISOString() } as never)
    .eq("id", threadId);

  // Notify each non-self participant (the assignees + anyone else
  // pinned on the thread) so the bell badges appropriately.
  const recipients = participantIds.filter((id) => id !== user.id);
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
          title: `${callerName} requested a status update`,
          body: `"${task.title}" — ${TEMPLATE_BODY}`,
          entity_type: "task",
          entity_id: taskId,
          terminal_id: task.terminal_id,
          actor_id: user.id,
          url: "/messages",
        })) as never,
      );
  }

  return NextResponse.json(
    {
      data: {
        thread_id: threadId,
        message_id: (msg as { id: string }).id,
        recipients,
      },
    },
    { status: 201 },
  );
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
  "POST /api/v1/tasks/:id/request-update",
);
