import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ id: string }>;
}

/**
 * POST   /api/v1/tasks/:id/assignees  { user_id }   — assign user
 * DELETE /api/v1/tasks/:id/assignees?user_id=<uuid> — unassign user
 *
 * Assignees are scoped by terminal membership through RLS (task_assignees
 * policies check that both parties see the parent terminal).
 */
async function handlePost(request: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    user_id?: string;
  };
  if (!body.user_id) return bad("user_id is required");

  const { error } = await supabase
    .from("task_assignees")
    // @ts-expect-error generic insert collapses to never
    .insert({
      task_id: taskId,
      user_id: body.user_id,
      assigned_by: user.id,
    });
  if (error) {
    if (error.code === "23505") return new NextResponse(null, { status: 204 }); // already assigned
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

  const userId = new URL(request.url).searchParams.get("user_id");
  if (!userId) return bad("user_id query param is required");

  const { error } = await supabase
    .from("task_assignees")
    .delete()
    .eq("task_id", taskId)
    .eq("user_id", userId);
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
  "POST /api/v1/tasks/:id/assignees",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/tasks/:id/assignees",
);
