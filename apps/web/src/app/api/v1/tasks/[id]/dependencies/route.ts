import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST   /api/v1/tasks/:id/dependencies  { depends_on }
 *         — say "this task depends on <depends_on>"
 * DELETE /api/v1/tasks/:id/dependencies?depends_on=<uuid>
 *         — remove the dependency edge
 *
 * The RLS policies on task_dependencies require the caller to see both
 * tasks involved.
 */
async function handlePost(request: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    depends_on?: string;
  };
  if (!body.depends_on) return bad("depends_on is required");
  if (body.depends_on === taskId)
    return bad("a task cannot depend on itself");

  // Simple cycle guard: if the target already depends on this task
  // (directly), rejecting prevents a 2-node cycle. Deep cycle detection
  // can land later with a recursive CTE check.
  const { data: reverse } = await supabase
    .from("task_dependencies")
    .select("task_id")
    .eq("task_id", body.depends_on)
    .eq("depends_on", taskId)
    .maybeSingle();
  if (reverse) return bad("cycle: target already depends on this task");

  const { error } = await supabase
    .from("task_dependencies")
    // @ts-expect-error generic insert collapses to never
    .insert({ task_id: taskId, depends_on: body.depends_on });
  if (error) {
    if (error.code === "23505") return new NextResponse(null, { status: 204 });
    return internal(error.message);
  }
  return new NextResponse(null, { status: 204 });
}

async function handleDelete(request: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const dependsOn = new URL(request.url).searchParams.get("depends_on");
  if (!dependsOn) return bad("depends_on query param is required");

  const { error } = await supabase
    .from("task_dependencies")
    .delete()
    .eq("task_id", taskId)
    .eq("depends_on", dependsOn);
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
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/tasks/:id/dependencies",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/tasks/:id/dependencies",
);
