import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events";
import { withObservability } from "@/lib/observability";
import { validateRecurrenceRule } from "@/lib/task-recurrence";
import { normalizeEmails } from "@/lib/normalize-emails";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";
import type { TaskRecurrenceRule, TaskStatus } from "@rokki/db";

interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * GET  /api/v1/projects/:ticker/tasks              — list tasks (filterable)
 * POST /api/v1/projects/:ticker/tasks              — create task
 *
 * Spec: docs/02_API.md §2.7
 */
async function handleGet(request: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const project = await resolveProject(supabase, ticker);
  if (!project) return notFound();

  const url = new URL(request.url);
  const status = url.searchParams.get("status") as TaskStatus | null;
  /**
   * Sort modes:
   *   - "auto" (default): the natural triage order — incomplete first
   *     (completed_at NULLs first), then priority asc, due_date asc,
   *     created_at desc.
   *   - "position": the user-controlled drag-to-reorder order. Falls
   *     back to created_at as a tiebreaker for rows whose `position`
   *     is still NULL (legacy or freshly inserted before the
   *     trigger backfilled).
   */
  const sortMode =
    url.searchParams.get("sort") === "position" ? "position" : "auto";

  let query = supabase
    .from("tasks")
    .select(
      "id, ticker_seq, title, description, status, priority, due_date, labels, position, starred, latest_status_text, latest_status_author_id, latest_status_at, status_thread_id, external_assignee_emails, recurrence_rule, created_at, updated_at, completed_at",
    )
    .eq("terminal_id", project.id);

  if (status) query = query.eq("status", status);

  // Starred tasks always float to the top — that's the contract of
  // the star ("highest priority of the day"). Within the starred and
  // unstarred groups we keep the existing sort: by-position for
  // manual mode, by status → priority → due → created for auto.
  query = query.order("starred", { ascending: false });

  if (sortMode === "position") {
    query = query
      .order("position", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query
      .order("completed_at", { ascending: true, nullsFirst: true })
      .order("priority", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });
  }

  const { data: taskRows, error } = await query;

  if (error) return internal(error.message);

  type TaskRow = {
    id: string;
    ticker_seq: number;
    title: string;
    description: string | null;
    status: string;
    priority: number;
    due_date: string | null;
    labels: string[] | null;
    position: number | null;
    external_assignee_emails: string[] | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  };
  const tasks = (taskRows ?? []) as TaskRow[];
  const taskIds = tasks.map((t) => t.id);

  // Aggregate subtask completion + assignees in a single follow-up pass each.
  // Two extra round-trips beat N+1 from joins; volumes here are O(few hundred).
  let subtaskTotals = new Map<string, { total: number; done: number }>();
  let assigneesByTask = new Map<
    string,
    { user_id: string; full_name: string | null }[]
  >();

  if (taskIds.length > 0) {
    const { data: subtaskRows } = await supabase
      .from("subtasks")
      .select("task_id, done")
      .in("task_id", taskIds);
    type SubRow = { task_id: string; done: boolean };
    for (const r of (subtaskRows ?? []) as SubRow[]) {
      const acc = subtaskTotals.get(r.task_id) ?? { total: 0, done: 0 };
      acc.total += 1;
      if (r.done) acc.done += 1;
      subtaskTotals.set(r.task_id, acc);
    }

    const { data: assigneeRows } = await supabase
      .from("task_assignees")
      .select("task_id, user_id")
      .in("task_id", taskIds);
    type ARow = { task_id: string; user_id: string };
    const assigneeUserIds = Array.from(
      new Set(((assigneeRows ?? []) as ARow[]).map((r) => r.user_id)),
    );
    let nameById = new Map<string, string | null>();
    if (assigneeUserIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", assigneeUserIds);
      type PRow = { user_id: string; full_name: string | null };
      for (const p of (profiles ?? []) as PRow[]) {
        nameById.set(p.user_id, p.full_name);
      }
    }
    for (const r of (assigneeRows ?? []) as ARow[]) {
      const list = assigneesByTask.get(r.task_id) ?? [];
      list.push({
        user_id: r.user_id,
        full_name: nameById.get(r.user_id) ?? null,
      });
      assigneesByTask.set(r.task_id, list);
    }
  }

  const data = tasks.map((t) => ({
    ...t,
    subtask_total: subtaskTotals.get(t.id)?.total ?? 0,
    subtask_done: subtaskTotals.get(t.id)?.done ?? 0,
    assignees: assigneesByTask.get(t.id) ?? [],
    external_assignee_emails: t.external_assignee_emails ?? [],
  }));

  return NextResponse.json({ data });
}

async function handlePost(request: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const project = await resolveProject(supabase, ticker);
  if (!project) return notFound();

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string | null;
    priority?: number;
    due_date?: string | null;
    labels?: string[];
    /** Spec also calls these "tags"; we accept either name and map to labels. */
    tags?: string[];
    status?: TaskStatus;
    recurrence_rule?: TaskRecurrenceRule | null;
    /**
     * Optional explicit assignee list. Omit (or send empty) to fall back
     * to "creator is the assignee" — handled both here and by the
     * trg_tasks_default_assignee trigger.
     */
    assignee_ids?: string[];
    /**
     * External (not-yet-platform-user) email assignees. Stored on
     * tasks.external_assignee_emails as a normalized text[]. The
     * email-invite + reconcile flow runs server-side later.
     */
    external_assignee_emails?: string[];
  };

  if (!body.title?.trim()) return bad("title is required");
  if (body.title.length > 300) return bad("title must be ≤ 300 characters");
  // priority: nullable + 1..3 (1=High, 2=Medium, 3=Low, NULL=No
  // priority). Was 1..4 before the 2026-05-07 redesign.
  if (
    body.priority !== undefined &&
    body.priority !== null &&
    (body.priority < 1 || body.priority > 3)
  )
    return bad("priority must be 1 (High), 2 (Medium), 3 (Low), or null");

  let rule: TaskRecurrenceRule | null = null;
  if (body.recurrence_rule !== undefined) {
    const parsed = validateRecurrenceRule(body.recurrence_rule);
    if (parsed === "invalid") return bad("recurrence_rule shape is invalid");
    rule = parsed;
  }

  // Normalize external assignee emails: trim, lower-case, dedupe,
  // reject anything obviously not an email. The DB column is
  // NOT NULL DEFAULT '{}', so an empty list becomes the default.
  const externalEmails = normalizeEmails(body.external_assignee_emails ?? []);
  if (externalEmails === "invalid") {
    return bad("external_assignee_emails contains an invalid address");
  }

  const result = await supabase
    .from("tasks")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: project.id,
      title: body.title.trim(),
      description: body.description ?? null,
      // Default = NULL (no priority) per the 2026-05-07 redesign.
      // Was `?? 3` (Medium / "Normal" in the old 1-4 scheme).
      priority: body.priority ?? null,
      due_date: body.due_date ?? null,
      labels: body.tags ?? body.labels ?? [],
      status: body.status ?? "todo",
      recurrence_rule: rule,
      external_assignee_emails: externalEmails,
      created_by: user.id,
    })
    // Return the same column set the GET list endpoint returns so the
    // client can drop the new row straight into local state without
    // faking fields. The optimistic-insert path in TasksPane depends
    // on this — any field missing here ends up as `undefined` on the
    // freshly-created row and visibly differs from neighbouring rows
    // until the next refetch lands.
    .select(
      "id, ticker_seq, title, description, status, priority, due_date, labels, position, starred, latest_status_text, latest_status_author_id, latest_status_at, status_thread_id, external_assignee_emails, recurrence_rule, created_at, updated_at, completed_at",
    )
    .single();

  const data = result.data as
    | {
        id: string;
        ticker_seq: number;
        title: string;
      }
    | null;

  if (result.error || !data) {
    return internal(result.error?.message ?? "insert failed");
  }

  // Default-assignee fallback (defence in depth — the AFTER INSERT trigger
  // also enforces this at the DB level). When the caller passes assignees
  // explicitly we honour the list; otherwise the creator becomes the sole
  // assignee. The trigger is idempotent (ON CONFLICT DO NOTHING) so the
  // explicit-insert path here is never wasted work.
  const explicitAssignees = (body.assignee_ids ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const toAssign =
    explicitAssignees.length > 0 ? explicitAssignees : [user.id];
  if (toAssign.length > 0) {
    const rows = toAssign.map((uid) => ({
      task_id: data.id,
      user_id: uid,
      assigned_by: user.id,
    }));
    await supabase
      .from("task_assignees")
      // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
      .upsert(rows, { onConflict: "task_id,user_id" });
  }

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: project.id,
      space_id: project.space_id,
      actor_id: user.id,
      action: "task.create",
      entity_type: "task",
      entity_id: data.id,
      metadata: { title: data.title, ticker_seq: data.ticker_seq },
    });

  // Emit the machine-readable domain event too. Webhooks, analytics, and
  // future replayable projections consume this stream.
  void emitEvent("task.created", {
    actor_id: user.id,
    space_id: project.space_id,
    terminal_id: project.id,
    entity_type: "task",
    entity_id: data.id,
    payload: {
      title: data.title,
      ticker_seq: data.ticker_seq,
    },
  });

  // Build the response in the same shape the list endpoint returns so
  // the client can drop it straight into state. For a brand-new task
  // the assignee list is known (we just inserted it) and the subtask
  // aggregates are zero — no need for an extra round-trip.
  const assigneeProfiles = toAssign.length
    ? ((
        await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", toAssign)
      ).data ?? [])
    : [];
  const profileById = new Map(
    (assigneeProfiles as { user_id: string; full_name: string | null }[]).map(
      (p) => [p.user_id, p.full_name],
    ),
  );
  const responseTask = {
    ...(data as Record<string, unknown>),
    assignees: toAssign.map((uid) => ({
      user_id: uid,
      full_name: profileById.get(uid) ?? null,
    })),
    subtask_total: 0,
    subtask_done: 0,
    external_assignee_emails:
      (data as { external_assignee_emails?: string[] | null })
        .external_assignee_emails ?? externalEmails,
  };

  return NextResponse.json({ data: responseTask }, { status: 201 });
}

async function resolveProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticker: string,
) {
  return resolveTerminalBySegment(supabase, ticker);
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
    { errors: [{ code: "not_found", message: "Project not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const GET = withObservability<Props>(handleGet, "GET /api/v1/projects/:ticker/tasks");
export const POST = withObservability<Props>(handlePost, "POST /api/v1/projects/:ticker/tasks");
