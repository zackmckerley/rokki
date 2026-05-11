import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

/**
 * GET /api/v1/briefing
 *
 * Morning briefing payload — deterministic counts + curated samples, no
 * LLM calls. The dashboard card renders this with a "Good morning, X …"
 * intro line. Keep the computation cheap: 4 small queries, ~50 ms total.
 */
async function handleGet() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );

  const today = new Date();
  const startOfToday = new Date(today);
  startOfToday.setHours(0, 0, 0, 0);
  const in24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // My assigned tasks (not done) with due dates.
  const { data: assignedIds } = await supabase
    .from("task_assignees")
    .select("task_id")
    .eq("user_id", user.id);
  const taskIds = ((assignedIds ?? []) as { task_id: string }[]).map(
    (r) => r.task_id,
  );

  let dueToday = 0;
  let overdue = 0;
  let nextUp: {
    id: string;
    title: string;
    due_date: string | null;
    terminal_id: string;
  } | null = null;
  if (taskIds.length > 0) {
    const { data: rows } = await supabase
      .from("tasks")
      .select("id, title, due_date, terminal_id, status")
      .in("id", taskIds)
      .neq("status", "done");
    type T = {
      id: string;
      title: string;
      due_date: string | null;
      terminal_id: string;
      status: string;
    };
    const tasks = (rows ?? []) as T[];
    const today0 = startOfToday.getTime();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const dueMs = new Date(t.due_date).getTime();
      if (dueMs < today0) overdue++;
      else if (dueMs < today0 + 86_400_000) dueToday++;
    }
    const upcoming = tasks
      .filter((t) => t.due_date)
      .sort(
        (a, b) =>
          new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime(),
      );
    nextUp = upcoming[0] ?? null;
  }

  // Unread mentions in the last 24h.
  const { count: mentionCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("kind", "mention")
    .gte("created_at", in24h.toISOString())
    .is("read_at", null);

  // Activity highlights in the last 24h (scoped by RLS).
  const { data: acts } = await supabase
    .from("activity")
    .select("action, metadata, created_at")
    .gte("created_at", in24h.toISOString())
    .order("created_at", { ascending: false })
    .limit(100);
  type Act = {
    action: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
  };
  const actions = (acts ?? []) as Act[];
  const tasksCompleted = actions.filter((a) => a.action === "task.complete").length;
  const filesUploaded = actions.filter(
    (a) =>
      a.action === "file.upload" &&
      (a.metadata as { op?: string })?.op !== "folder.create",
  ).length;
  const tasksCreated = actions.filter((a) => a.action === "task.create").length;

  // Resolve ticker for "next up" if present.
  let nextUpTicker: string | null = null;
  if (nextUp) {
    const { data: t } = await supabase
      .from("terminals")
      .select("ticker")
      .eq("id", nextUp.terminal_id)
      .maybeSingle();
    nextUpTicker = (t as { ticker: string } | null)?.ticker ?? null;
  }

  return NextResponse.json({
    data: {
      date: startOfToday.toISOString().slice(0, 10),
      due_today: dueToday,
      overdue,
      mentions_24h: mentionCount ?? 0,
      tasks_completed_24h: tasksCompleted,
      tasks_created_24h: tasksCreated,
      files_uploaded_24h: filesUploaded,
      next_up: nextUp
        ? {
            id: nextUp.id,
            title: nextUp.title,
            due_date: nextUp.due_date,
            terminal_ticker: nextUpTicker,
          }
        : null,
    },
  });
}

export const GET = withObservability(handleGet, "GET /api/v1/briefing");
