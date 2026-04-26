import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

interface Props {
  params: Promise<{ id: string; subtaskId: string }>;
}

/**
 * PATCH  /api/v1/tasks/:id/subtasks/:subtaskId  { label?, done?, position? }
 * DELETE /api/v1/tasks/:id/subtasks/:subtaskId
 *
 * RLS pins everything to the parent task; we still scope by both id +
 * subtaskId so a typo can't accidentally hit a sibling task's subtask.
 */
async function handlePatch(request: NextRequest, { params }: Props) {
  const { id: taskId, subtaskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    label?: string;
    done?: boolean;
    position?: number;
  };

  const patch: Record<string, unknown> = {};
  if (body.label !== undefined) {
    if (!body.label.trim()) return bad("label cannot be empty");
    if (body.label.length > 500) return bad("label must be ≤ 500 characters");
    patch.label = body.label.trim();
  }
  if (body.done !== undefined) {
    if (typeof body.done !== "boolean") return bad("done must be boolean");
    patch.done = body.done;
  }
  if (body.position !== undefined) {
    if (!Number.isInteger(body.position)) return bad("position must be an integer");
    patch.position = body.position;
  }
  if (Object.keys(patch).length === 0) return bad("no fields to update");

  const result = (await supabase
    .from("subtasks")
    // @ts-expect-error generic update collapses to never
    .update(patch)
    .eq("id", subtaskId)
    .eq("task_id", taskId)
    .select("id, task_id, label, done, position, created_at, updated_at")
    .single()) as {
    data: unknown;
    error: { code?: string; message: string } | null;
  };

  if (result.error || !result.data) {
    if (result.error?.code === "PGRST116") return notFound();
    return internal(result.error?.message ?? "update failed");
  }
  return NextResponse.json({ data: result.data });
}

async function handleDelete(_req: NextRequest, { params }: Props) {
  const { id: taskId, subtaskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { error } = await supabase
    .from("subtasks")
    .delete()
    .eq("id", subtaskId)
    .eq("task_id", taskId);
  if (error) return internal(error.message);
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
    { errors: [{ code: "not_found", message: "Subtask not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const PATCH = withObservability<Props>(handlePatch, "PATCH /api/v1/tasks/:id/subtasks/:subtaskId");
export const DELETE = withObservability<Props>(handleDelete, "DELETE /api/v1/tasks/:id/subtasks/:subtaskId");
