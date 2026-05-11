import { NextResponse, type NextRequest } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { withObservability } from "@/lib/observability";
import type { Database } from "@rokki/db";

/**
 * POST /api/v1/cron/reminders
 *
 * Daily reminders fan-out. For every user who already has a
 * `kind='reminders'` thread (i.e. who's hit "Turn on Reminders"
 * once), recompute their overdue + due-today open tasks and post a
 * fresh ping for any task that hasn't been reminded in the past 24h.
 *
 * Mirrors `/api/v1/reminders/refresh` per-user but runs as a single
 * service-role pass so a cron caller doesn't need to impersonate
 * each user.
 *
 * Auth: same `x-cron-secret` / Bearer pattern as the calendar-sync
 * cron. The /api/v1/cron/* prefix is allowlisted in the auth
 * middleware so this handler runs without a user session — the
 * secret is the only gate.
 *
 * Idempotent: per-task 24h dedupe means re-running the same hour
 * is a no-op. We also tolerate transient errors (network, RLS
 * surprises) and continue with the next user — the daily run can
 * tolerate missing one user once if their next run picks them up.
 *
 * Response:
 *   { data: { users_processed, posted, skipped, errors } }
 */
export const dynamic = "force-dynamic";
// Generous timeout — large user bases mean a single tick can fan
// out to hundreds of refreshes, each two or three round-trips.
export const maxDuration = 300;

interface TickResult {
  users_processed: number;
  posted: number;
  skipped: number;
  errors: number;
}

async function handlePost(request: NextRequest) {
  if (!authorize(request)) return unauthorized();
  const result = await runRemindersTick();
  return NextResponse.json({ data: result });
}

// GET for smoke-test convenience. Same auth gate.
async function handleGet(request: NextRequest) {
  if (!authorize(request)) return unauthorized();
  const result = await runRemindersTick();
  return NextResponse.json({ data: result });
}

export const POST = withObservability(handlePost, "POST /api/v1/cron/reminders");
export const GET = withObservability(handleGet, "GET /api/v1/cron/reminders");

async function runRemindersTick(): Promise<TickResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { users_processed: 0, posted: 0, skipped: 0, errors: 0 };
  }
  const admin = createAdminClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Gather every reminders thread + its single participant. The
  // user_id IS the audience for that thread; one round-trip lets us
  // drive the whole fan-out without per-user thread lookups.
  const { data: threads } = await admin
    .from("message_threads")
    .select(
      "id, thread_participants!thread_participants_thread_id_fkey(user_id)",
    )
    .eq("kind", "reminders" as never);

  type ThreadRow = {
    id: string;
    thread_participants: { user_id: string } | { user_id: string }[] | null;
  };
  const result: TickResult = {
    users_processed: 0,
    posted: 0,
    skipped: 0,
    errors: 0,
  };
  for (const row of ((threads ?? []) as unknown) as ThreadRow[]) {
    const part = Array.isArray(row.thread_participants)
      ? row.thread_participants[0]
      : row.thread_participants;
    if (!part?.user_id) continue;
    try {
      const r = await refreshOne(admin, row.id, part.user_id);
      result.users_processed += 1;
      result.posted += r.posted;
      result.skipped += r.skipped;
    } catch {
      result.errors += 1;
    }
  }
  return result;
}

/**
 * Per-user refresh — mirror of /api/v1/reminders/refresh's compute
 * step, but driven by the service-role admin client so we don't need
 * a user session. RLS doesn't apply here; the trade-off is that the
 * caller (cron) must already know the user_id this thread belongs to.
 */
async function refreshOne(
  admin: ReturnType<typeof createAdminClient<Database>>,
  threadId: string,
  userId: string,
): Promise<{ posted: number; skipped: number }> {
  // Find the user's overdue + due-today open assigned tasks.
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const todayIso = today.toISOString().slice(0, 10);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  const { data: rows } = await admin
    .from("task_assignees")
    .select(
      "tasks!task_assignees_task_id_fkey(id, title, status, due_date)",
    )
    .eq("user_id", userId);

  type AssignedRow = {
    tasks: {
      id: string;
      title: string;
      status: string;
      due_date: string | null;
    } | null;
  };
  const open = (((rows ?? []) as unknown) as AssignedRow[])
    .map((r) => r.tasks)
    .filter((t): t is NonNullable<AssignedRow["tasks"]> => !!t)
    .filter((t) => t.status !== "done")
    .filter((t) => t.due_date && t.due_date < tomorrowIso);

  // Per-task 24h dedupe — don't double-post.
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("messages")
    .select("pinging_task_id, created_at")
    .eq("thread_id", threadId)
    .gte("created_at", cutoff);
  type RecentRow = { pinging_task_id: string | null; created_at: string };
  const recentTaskIds = new Set(
    (((recent ?? []) as unknown) as RecentRow[])
      .map((r) => r.pinging_task_id)
      .filter((x): x is string => !!x),
  );

  let posted = 0;
  let skipped = 0;
  for (const t of open) {
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
        author_id: userId,
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
  return { posted, skipped };
}

function authorize(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // no secret configured = endpoint disabled
  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === expected) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${expected}`) return true;
  return false;
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    {
      errors: [
        {
          code: "unauthorized",
          message:
            "Cron endpoint requires `x-cron-secret` or Bearer token",
        },
      ],
    },
    { status: 401 },
  );
}
