import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET  /api/v1/tasks/:id/watchers
 *   → list users watching this task, decorated with profile.
 *
 * POST /api/v1/tasks/:id/watchers   { user_id }
 *   → start watching. RLS allows self-add freely; adding others requires
 *     terminal_manager OR being the task creator.
 *
 * Notification mechanism (judgment call): we register the watch row here
 * and rely on the existing notifications pipeline + Realtime subscriptions
 * in TaskDetail to push updates. Wiring task-update events into the
 * notifications table for watchers (the "you got an email when X changed"
 * pathway) is a follow-up — keeping this PR focused on the data model +
 * API + UI surface.
 */
async function handlePost(request: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as { user_id?: string };
  if (!body.user_id) return bad("user_id is required");

  const { error } = await supabase
    .from("task_watchers")
    // @ts-expect-error generic insert collapses to never
    .insert({
      task_id: taskId,
      user_id: body.user_id,
      added_by: user.id,
    });
  if (error) {
    if (error.code === "23505") return new NextResponse(null, { status: 204 }); // already watching
    return internal(error.message);
  }
  return new NextResponse(null, { status: 204 });
}

async function handleGet(_req: NextRequest, { params }: Props) {
  const { id: taskId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data: watchers, error } = await supabase
    .from("task_watchers")
    .select("user_id, added_at")
    .eq("task_id", taskId);
  if (error) return internal(error.message);

  type W = { user_id: string; added_at: string };
  const list = (watchers ?? []) as W[];
  if (list.length === 0) return NextResponse.json({ data: [] });

  const ids = list.map((w) => w.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, full_name, avatar_url")
    .in("user_id", ids);
  type P = { user_id: string; full_name: string | null; avatar_url: string | null };
  const byId = new Map(((profiles ?? []) as P[]).map((p) => [p.user_id, p]));
  return NextResponse.json({
    data: list.map((w) => ({
      user_id: w.user_id,
      added_at: w.added_at,
      full_name: byId.get(w.user_id)?.full_name ?? null,
      avatar_url: byId.get(w.user_id)?.avatar_url ?? null,
    })),
  });
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

export const GET = withObservability<Props>(handleGet, "GET /api/v1/tasks/:id/watchers");
export const POST = withObservability<Props>(handlePost, "POST /api/v1/tasks/:id/watchers");
