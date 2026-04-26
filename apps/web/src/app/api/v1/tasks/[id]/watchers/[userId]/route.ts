import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

interface Props {
  params: Promise<{ id: string; userId: string }>;
}

/**
 * DELETE /api/v1/tasks/:id/watchers/:userId
 *   → unwatch. RLS allows self-remove freely; removing others requires
 *     terminal_manager OR being the task creator.
 */
async function handleDelete(_req: NextRequest, { params }: Props) {
  const { id: taskId, userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { error } = await supabase
    .from("task_watchers")
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
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const DELETE = withObservability<Props>(handleDelete, "DELETE /api/v1/tasks/:id/watchers/:userId");
