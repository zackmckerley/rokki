import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { validateRecurrenceRule } from "@/lib/task-recurrence";
import type { TaskRecurrenceRule, TaskStatus } from "@rokki/db";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET    /api/v1/tasks/:id — task detail
 * PATCH  /api/v1/tasks/:id — partial update
 * DELETE /api/v1/tasks/:id — delete
 *
 * Spec: docs/02_API.md §2.7
 */
async function handleGet(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data, error } = await supabase
    .from("tasks")
    .select(
      "id, terminal_id, ticker_seq, title, description, status, priority, due_date, labels, metadata, recurrence_rule, recurrence_parent_id, created_at, created_by, updated_at, completed_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) return internal(error.message);
  if (!data) return notFound();
  return NextResponse.json({ data });
}

async function handlePatch(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string | null;
    status?: TaskStatus;
    priority?: number;
    due_date?: string | null;
    labels?: string[];
    /** Spec also calls these "tags"; we accept either name and map to labels. */
    tags?: string[];
    recurrence_rule?: TaskRecurrenceRule | null;
  };

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    if (!body.title.trim()) return bad("title cannot be empty");
    if (body.title.length > 300) return bad("title must be ≤ 300 characters");
    patch.title = body.title.trim();
  }
  if (body.description !== undefined) patch.description = body.description;
  if (body.priority !== undefined) {
    if (body.priority < 1 || body.priority > 4) return bad("priority must be 1–4");
    patch.priority = body.priority;
  }
  if (body.due_date !== undefined) patch.due_date = body.due_date;
  if (body.labels !== undefined) patch.labels = body.labels;
  if (body.tags !== undefined) patch.labels = body.tags;
  if (body.recurrence_rule !== undefined) {
    const rule = validateRecurrenceRule(body.recurrence_rule);
    if (rule === "invalid") return bad("recurrence_rule shape is invalid");
    patch.recurrence_rule = rule;
  }
  if (body.status !== undefined) {
    patch.status = body.status;
    patch.completed_at = body.status === "done" ? new Date().toISOString() : null;
  }

  if (Object.keys(patch).length === 0) return bad("no fields to update");

  const result = await supabase
    .from("tasks")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .update(patch)
    .eq("id", id)
    .select(
      "id, terminal_id, ticker_seq, title, description, status, priority, due_date, labels, recurrence_rule, recurrence_parent_id, completed_at, updated_at",
    )
    .single();

  const data = result.data as { terminal_id: string } | null;
  if (result.error || !data) {
    if (result.error?.code === "PGRST116") return notFound();
    return internal(result.error?.message ?? "update failed");
  }

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: data.terminal_id,
      actor_id: user.id,
      action: body.status === "done" ? "task.complete" : "task.update",
      entity_type: "task",
      entity_id: id,
      metadata: patch,
    });

  return NextResponse.json({ data });
}

async function handleDelete(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  // Capture terminal_id for the activity log before deletion
  const { data: existing } = await supabase
    .from("tasks")
    .select("terminal_id")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return internal(error.message);

  if (existing) {
    const project = existing as { terminal_id: string };
    await supabase
      .from("activity")
      // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
      .insert({
        terminal_id: project.terminal_id,
        actor_id: user.id,
        action: "task.delete",
        entity_type: "task",
        entity_id: id,
      });
  }

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

export const GET = withObservability<Props>(handleGet, "GET /api/v1/tasks/:id");
export const PATCH = withObservability<Props>(handlePatch, "PATCH /api/v1/tasks/:id");
export const DELETE = withObservability<Props>(handleDelete, "DELETE /api/v1/tasks/:id");
