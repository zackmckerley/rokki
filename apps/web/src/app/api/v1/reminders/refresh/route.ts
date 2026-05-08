import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import type { Database } from "@rokki/db";

/**
 * POST /api/v1/reminders/refresh
 *
 * Refreshes the caller's personal reminders thread.
 *
 *   1. Looks up (or lazily creates) a `kind='reminders'` thread that
 *      has the caller as the sole participant.
 *   2. Computes the user's "what's waiting on me today?" set:
 *        - Overdue open tasks (due_date < today, status != 'done')
 *        - Due-today open tasks
 *      The horizon is intentionally tight — if we widen to 7d the
 *      thread becomes a wall of stale dread instead of a triage
 *      surface.
 *   3. For each task in the set that doesn't already have a reminder
 *      in the thread within the last 24h, inserts a message with
 *      `pinging_task_id` so the inbox renders a deep-link chip.
 *
 * Idempotent: calling twice in rapid succession is a no-op (the 24h
 * dedupe gate). Cron worker eventually owns the schedule; for now
 * the UI button + manual API call cover the cycle.
 *
 * Response:
 *   { data: { thread_id, posted: number, skipped: number } }
 */
async function handlePost(_req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 1. Find or create the user's reminders thread.
  let threadId: string | null = null;
  const { data: existingThreads } = await admin
    .from("thread_participants")
    .select(
      "thread_id, message_threads!thread_participants_thread_id_fkey(id, kind)",
    )
    .eq("user_id", user.id);
  type Row = {
    thread_id: string;
    message_threads: { id: string; kind: string } | null;
  };
  for (const r of (existingThreads ?? []) as unknown as Row[]) {
    if (r.message_threads?.kind === "reminders") {
      threadId = r.thread_id;
      break;
    }
  }
  if (!threadId) {
    const { data: newThread, error: tErr } = await admin
      .from("message_threads")
      .insert({ kind: "reminders" } as never)
      .select("id")
      .single();
    if (tErr || !newThread) {
      return internal(tErr?.message ?? "thread create failed");
    }
    threadId = (newThread as { id: string }).id;
    await admin
      .from("thread_participants")
      .insert({ thread_id: threadId, user_id: user.id } as never);
  }

  // 2. Compute the user's overdue + due-today open tasks. RLS via the
  //    user's supabase client — admins of nothing are fine; the
  //    join through task_assignees is what we filter on.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayIso = today.toISOString().slice(0, 10);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  const { data: tasksRows } = await supabase
    .from("task_assignees")
    .select(
      "tasks!task_assignees_task_id_fkey(id, title, status, due_date, terminal_id, ticker_seq)",
    )
    .eq("user_id", user.id);

  type AssignedRow = {
    tasks: {
      id: string;
      title: string;
      status: string;
      due_date: string | null;
      terminal_id: string;
      ticker_seq: number;
    } | null;
  };
  const assigned = ((tasksRows ?? []) as unknown as AssignedRow[])
    .map((r) => r.tasks)
    .filter((t): t is NonNullable<AssignedRow["tasks"]> => !!t)
    .filter((t) => t.status !== "done")
    .filter(
      (t) =>
        t.due_date &&
        t.due_date < tomorrowIso, // overdue OR due today
    );

  // 3. Look up the caller's recent reminder messages so we don't
  //    spam the same task twice in 24h. `pinging_task_id` keys the
  //    dedupe — the same row can be reminded again tomorrow once
  //    the 24h window slides past.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentMsgs } = await admin
    .from("messages")
    .select("pinging_task_id, created_at")
    .eq("thread_id", threadId)
    .gte("created_at", cutoff);
  type RecentRow = { pinging_task_id: string | null; created_at: string };
  // @rokki/db types lag the latest migration — `pinging_task_id`
  // exists in prod but the generated types haven't been regenerated.
  // Round-trip through unknown to drop the synthesised SelectQueryError.
  const recentTaskIds = new Set(
    ((recentMsgs ?? []) as unknown as RecentRow[])
      .map((r) => r.pinging_task_id)
      .filter((x): x is string => !!x),
  );

  let posted = 0;
  let skipped = 0;
  for (const t of assigned) {
    if (recentTaskIds.has(t.id)) {
      skipped += 1;
      continue;
    }
    const overdue = (t.due_date ?? "") < todayIso;
    const body = overdue
      ? `Overdue: "${t.title}" — was due ${t.due_date ?? "?"}`
      : `Due today: "${t.title}"`;
    await admin
      .from("messages")
      .insert({
        thread_id: threadId,
        author_id: user.id,
        body,
        pinging_task_id: t.id,
      } as never);
    posted += 1;
  }

  if (posted > 0) {
    await admin
      .from("message_threads")
      .update({ last_message_at: new Date().toISOString() } as never)
      .eq("id", threadId);
  }

  return NextResponse.json(
    { data: { thread_id: threadId, posted, skipped } },
    { status: 200 },
  );
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const POST = withObservability(
  handlePost,
  "POST /api/v1/reminders/refresh",
);
