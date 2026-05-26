import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { validateRecurrenceRule } from "@/lib/task-recurrence";
import { normalizeEmails } from "@/lib/normalize-emails";
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
    /** 1=High, 2=Medium, 3=Low, null=No priority. Pass null to clear. */
    priority?: number | null;
    due_date?: string | null;
    labels?: string[];
    /** Spec also calls these "tags"; we accept either name and map to labels. */
    tags?: string[];
    /**
     * Manual sort order — sparse integer. Drag-to-reorder in the
     * client picks midpoints between neighbouring positions to insert
     * a row without rewriting the full list (e.g. drop between
     * positions 1000 and 2000 → 1500).
     */
    position?: number;
    recurrence_rule?: TaskRecurrenceRule | null;
    /**
     * External (not-yet-platform-user) email assignees. Pass the
     * full canonical list — server replaces the column wholesale,
     * matching the way the user thinks of "set these emails" rather
     * than "add/remove". Pass `[]` to clear.
     */
    external_assignee_emails?: string[];
    /**
     * "Highest priority of the day" flag. Starred tasks float to the
     * top of every list (the GET endpoint orders by `starred DESC`
     * before applying the regular sort). Toggle from the row's star
     * button in TasksPane.
     */
    starred?: boolean;
    /**
     * Optimistic-concurrency token. If supplied (either via this field or
     * the `If-Match` header) we 409 when the row's current `updated_at`
     * doesn't match what the client thought it was editing.
     */
    expected_updated_at?: string;
  };

  const expectedUpdatedAt =
    body.expected_updated_at ?? request.headers.get("if-match") ?? null;

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    if (!body.title.trim()) return bad("title cannot be empty");
    if (body.title.length > 300) return bad("title must be ≤ 300 characters");
    patch.title = body.title.trim();
  }
  if (body.description !== undefined) patch.description = body.description;
  if (body.priority !== undefined) {
    // null is allowed (= "no priority"). 1..3 otherwise.
    if (
      body.priority !== null &&
      (body.priority < 1 || body.priority > 3)
    )
      return bad("priority must be 1 (High), 2 (Medium), 3 (Low), or null");
    patch.priority = body.priority;
  }
  if (body.due_date !== undefined) patch.due_date = body.due_date;
  if (body.labels !== undefined) patch.labels = body.labels;
  if (body.tags !== undefined) patch.labels = body.tags;
  if (body.position !== undefined) {
    if (!Number.isFinite(body.position)) return bad("position must be a number");
    patch.position = body.position;
  }
  if (body.recurrence_rule !== undefined) {
    const rule = validateRecurrenceRule(body.recurrence_rule);
    if (rule === "invalid") return bad("recurrence_rule shape is invalid");
    patch.recurrence_rule = rule;
  }
  if (body.status !== undefined) {
    patch.status = body.status;
    patch.completed_at = body.status === "done" ? new Date().toISOString() : null;
  }
  if (body.starred !== undefined) {
    patch.starred = Boolean(body.starred);
  }
  if (body.external_assignee_emails !== undefined) {
    const normalized = normalizeEmails(body.external_assignee_emails);
    if (normalized === "invalid") {
      return bad("external_assignee_emails contains an invalid address");
    }
    patch.external_assignee_emails = normalized;
  }

  if (Object.keys(patch).length === 0) return bad("no fields to update");

  // Concurrency check: if the caller supplied `expected_updated_at`, fetch
  // the current row first and 409 if it has moved. Doing this in two
  // round-trips is fine for the volume on this endpoint; a future
  // optimisation could push the check into the UPDATE WHERE clause.
  if (expectedUpdatedAt !== null) {
    const { data: current } = await supabase
      .from("tasks")
      .select(
        "id, terminal_id, ticker_seq, title, description, status, priority, starred, due_date, labels, recurrence_rule, recurrence_parent_id, completed_at, updated_at",
      )
      .eq("id", id)
      .maybeSingle();
    const cur = current as { updated_at: string } | null;
    if (!cur) return notFound();
    if (cur.updated_at !== expectedUpdatedAt) {
      return NextResponse.json(
        {
          errors: [
            {
              code: "conflict",
              message: "Task changed since you started editing.",
            },
          ],
          current,
          attempted: patch,
        },
        { status: 409 },
      );
    }
  }

  const result = await supabase
    .from("tasks")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .update(patch)
    .eq("id", id)
    .select(
      "id, terminal_id, ticker_seq, title, description, status, priority, starred, due_date, labels, recurrence_rule, recurrence_parent_id, completed_at, updated_at",
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

  // Soft-delete: set deleted_at + deleted_by. Hard-delete is reserved for
  // /admin/trash → "Permanent delete" with explicit confirmation. Tasks
  // remain queryable by service-role tooling and visible under emergency
  // access; normal terminal members lose them from list/detail views.
  const { data: existing } = await supabase
    .from("tasks")
    .select("terminal_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) return notFound();
  const project = existing as { terminal_id: string };

  const { error } = await supabase
    .from("tasks")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: user.id,
    })
    .eq("id", id);
  if (error) return internal(error.message);

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: project.terminal_id,
      actor_id: user.id,
      action: "task.delete",
      entity_type: "task",
      entity_id: id,
      metadata: { soft: true },
    });

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
