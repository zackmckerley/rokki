import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/v1/tasks/:id/subtasks   { label, position? }
 *   → creates a checklist item on the task. If `position` is omitted we
 *     append (max position + 1000), giving plenty of headroom for later
 *     reorders without a global re-index. Position is a sparse integer:
 *     to drop B between A and C, the client picks (A.position + C.position) / 2.
 *
 * GET  /api/v1/tasks/:id/subtasks
 *   → list, ordered by position.
 */
async function handlePost(request: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    label?: string;
    position?: number;
  };
  if (!body.label?.trim()) return bad("label is required");
  if (body.label.length > 500) return bad("label must be ≤ 500 characters");
  if (body.position !== undefined && !Number.isInteger(body.position))
    return bad("position must be an integer");

  // Append: read max(position) and add a stride.
  let position = body.position;
  if (position === undefined) {
    const { data: tail } = await supabase
      .from("subtasks")
      .select("position")
      .eq("task_id", taskId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const last = (tail as { position: number } | null)?.position ?? 0;
    position = last + 1000;
  }

  const result = (await supabase
    .from("subtasks")
    // @ts-expect-error generic insert collapses to never
    .insert({
      task_id: taskId,
      label: body.label.trim(),
      position,
      created_by: user.id,
    })
    .select("id, task_id, label, done, position, created_at, updated_at")
    .single()) as { data: unknown; error: { message: string } | null };

  if (result.error || !result.data) {
    return internal(result.error?.message ?? "insert failed");
  }
  return NextResponse.json({ data: result.data }, { status: 201 });
}

async function handleGet(_req: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data, error } = await supabase
    .from("subtasks")
    .select("id, task_id, label, done, position, created_at, updated_at")
    .eq("task_id", taskId)
    .order("position", { ascending: true });

  if (error) return internal(error.message);
  return NextResponse.json({ data });
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
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const GET = withObservability<Props>(handleGet, "GET /api/v1/tasks/:id/subtasks");
export const POST = withObservability<Props>(handlePost, "POST /api/v1/tasks/:id/subtasks");
