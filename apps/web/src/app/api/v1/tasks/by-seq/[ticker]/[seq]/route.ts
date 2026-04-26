import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ ticker: string; seq: string }>;
}

/**
 * GET /api/v1/tasks/by-seq/:ticker/:seq
 *
 * Rich task bundle for the detail view. One round-trip fetch covering:
 *   - the task
 *   - its assignees (+ profiles)
 *   - dependencies (both directions) with titles/statuses
 *   - activity history for this entity
 *
 * Scoped by RLS: if the caller can't see the terminal, they get 404.
 */
export async function GET(_req: NextRequest, { params }: Props) {
  const { ticker, seq: seqStr } = await params;
  const seq = Number(seqStr);
  if (!Number.isInteger(seq))
    return NextResponse.json(
      { errors: [{ code: "invalid_request", message: "seq must be an integer" }] },
      { status: 400 },
    );

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );

  const { data: terminal } = await supabase
    .from("terminals")
    .select("id, ticker, name, space_id")
    .eq("ticker", ticker.toUpperCase())
    .maybeSingle();
  type Term = { id: string; ticker: string; name: string; space_id: string };
  const term = terminal as Term | null;
  if (!term) return notFound();

  const { data: taskRow } = await supabase
    .from("tasks")
    .select(
      "id, ticker_seq, title, description, status, priority, due_date, labels, recurrence_rule, recurrence_parent_id, created_at, updated_at, completed_at, created_by",
    )
    .eq("terminal_id", term.id)
    .eq("ticker_seq", seq)
    .maybeSingle();
  if (!taskRow) return notFound();
  const task = taskRow as {
    id: string;
    ticker_seq: number;
    title: string;
    description: string | null;
    status: string;
    priority: number;
    due_date: string | null;
    labels: string[] | null;
    recurrence_rule: Record<string, unknown> | null;
    recurrence_parent_id: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
    created_by: string;
  };

  // Assignees → profiles
  const { data: assigneeRows } = await supabase
    .from("task_assignees")
    .select("user_id, assigned_at, assigned_by")
    .eq("task_id", task.id);
  type A = { user_id: string; assigned_at: string; assigned_by: string };
  const assigneeList = (assigneeRows ?? []) as A[];

  // Dependencies both directions
  const { data: depOut } = await supabase
    .from("task_dependencies")
    .select("depends_on")
    .eq("task_id", task.id);
  const { data: depIn } = await supabase
    .from("task_dependencies")
    .select("task_id")
    .eq("depends_on", task.id);

  const depOutIds = ((depOut ?? []) as { depends_on: string }[]).map(
    (r) => r.depends_on,
  );
  const depInIds = ((depIn ?? []) as { task_id: string }[]).map((r) => r.task_id);
  const relatedIds = Array.from(new Set([...depOutIds, ...depInIds]));

  const { data: relatedTasks } = relatedIds.length
    ? await supabase
        .from("tasks")
        .select("id, ticker_seq, title, status")
        .in("id", relatedIds)
    : { data: [] };
  type R = { id: string; ticker_seq: number; title: string; status: string };
  const relatedById = new Map(
    ((relatedTasks ?? []) as R[]).map((r) => [r.id, r]),
  );

  // Subtasks (ordered by position)
  const { data: subtaskRows } = await supabase
    .from("subtasks")
    .select("id, label, done, position, created_at, updated_at")
    .eq("task_id", task.id)
    .order("position", { ascending: true });
  type S = {
    id: string;
    label: string;
    done: boolean;
    position: number;
    created_at: string;
    updated_at: string;
  };
  const subtasks = (subtaskRows ?? []) as S[];

  // Watchers
  const { data: watcherRows } = await supabase
    .from("task_watchers")
    .select("user_id, added_at")
    .eq("task_id", task.id);
  type W = { user_id: string; added_at: string };
  const watcherList = (watcherRows ?? []) as W[];

  // Profiles for assignees + creator + watchers
  const userIds = Array.from(
    new Set([
      task.created_by,
      ...assigneeList.map((a) => a.user_id),
      ...watcherList.map((w) => w.user_id),
    ]),
  );
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds)
    : { data: [] };
  type P = {
    user_id: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  const profileBy = new Map(
    ((profiles ?? []) as P[]).map((p) => [p.user_id, p]),
  );

  const assignees = assigneeList.map((a) => ({
    user_id: a.user_id,
    full_name: profileBy.get(a.user_id)?.full_name ?? null,
    avatar_url: profileBy.get(a.user_id)?.avatar_url ?? null,
    assigned_at: a.assigned_at,
  }));

  const watchers = watcherList.map((w) => ({
    user_id: w.user_id,
    full_name: profileBy.get(w.user_id)?.full_name ?? null,
    avatar_url: profileBy.get(w.user_id)?.avatar_url ?? null,
    added_at: w.added_at,
  }));

  const dependsOn = depOutIds
    .map((id) => relatedById.get(id))
    .filter((r): r is R => !!r);
  const blocks = depInIds
    .map((id) => relatedById.get(id))
    .filter((r): r is R => !!r);

  // Activity history for this task — includes before_json / after_json so
  // the per-record timeline can render the trigger-emitted diff inline.
  const { data: activity } = await supabase
    .from("activity")
    .select(
      "id, action, actor_id, metadata, before_json, after_json, created_at",
    )
    .eq("entity_type", "task")
    .eq("entity_id", task.id)
    .order("created_at", { ascending: false })
    .limit(100);

  return NextResponse.json({
    data: {
      terminal: { id: term.id, ticker: term.ticker, name: term.name },
      task,
      assignees,
      watchers,
      subtasks,
      depends_on: dependsOn,
      blocks,
      creator: profileBy.get(task.created_by)
        ? {
            user_id: task.created_by,
            full_name: profileBy.get(task.created_by)!.full_name,
          }
        : { user_id: task.created_by, full_name: null },
      activity: activity ?? [],
    },
  });
}

function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Task not found" }] },
    { status: 404 },
  );
}
