import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events";
import { withObservability } from "@/lib/observability";
import { validateRecurrenceRule } from "@/lib/task-recurrence";
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

  let query = supabase
    .from("tasks")
    .select(
      "id, ticker_seq, title, description, status, priority, due_date, labels, position, created_at, updated_at, completed_at",
    )
    .eq("terminal_id", project.id);

  if (status) query = query.eq("status", status);

  const { data: taskRows, error } = await query
    .order("completed_at", { ascending: true, nullsFirst: true })
    .order("priority", { ascending: true })
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

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
  };

  if (!body.title?.trim()) return bad("title is required");
  if (body.title.length > 300) return bad("title must be ≤ 300 characters");
  if (body.priority !== undefined && (body.priority < 1 || body.priority > 4))
    return bad("priority must be 1–4");

  let rule: TaskRecurrenceRule | null = null;
  if (body.recurrence_rule !== undefined) {
    const parsed = validateRecurrenceRule(body.recurrence_rule);
    if (parsed === "invalid") return bad("recurrence_rule shape is invalid");
    rule = parsed;
  }

  const result = await supabase
    .from("tasks")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: project.id,
      title: body.title.trim(),
      description: body.description ?? null,
      priority: body.priority ?? 3,
      due_date: body.due_date ?? null,
      labels: body.tags ?? body.labels ?? [],
      status: body.status ?? "todo",
      recurrence_rule: rule,
      created_by: user.id,
    })
    .select(
      "id, ticker_seq, title, description, status, priority, due_date, labels, created_at",
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

  return NextResponse.json({ data }, { status: 201 });
}

async function resolveProject(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticker: string,
) {
  const { data } = await supabase
    .from("terminals")
    .select("id, space_id")
    .eq("ticker", ticker.toUpperCase())
    .is("archived_at", null)
    .maybeSingle();
  return data as { id: string; space_id: string } | null;
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
