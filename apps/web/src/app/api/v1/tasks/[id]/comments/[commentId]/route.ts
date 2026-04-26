import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { mentionedUserIds } from "@/lib/mentions";

interface Props {
  params: Promise<{ id: string; commentId: string }>;
}

/**
 * PATCH  /api/v1/tasks/:id/comments/:commentId  { body }
 *   → edit your own comment. RLS pins to created_by = auth.uid() and we
 *     additionally filter by entity_type/entity_id so a typo in the URL
 *     can't poke at someone else's comment on a different entity.
 *
 * DELETE /api/v1/tasks/:id/comments/:commentId
 *   → soft delete (sets deleted_at). Author OR terminal manager can delete
 *     per existing comments_delete RLS policy on the parent table.
 */
async function handlePatch(request: NextRequest, { params }: Props) {
  const { id: taskId, commentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as { body?: string };
  const content = (body.body ?? "").trim();
  if (content.length < 1 || content.length > 20_000)
    return bad("body must be 1–20,000 chars");

  const mentions = mentionedUserIds(content);
  const result = await supabase
    .from("comments")
    // @ts-expect-error generic update payload collapses to never
    .update({
      body: content,
      mentions,
      edited_at: new Date().toISOString(),
    })
    .eq("id", commentId)
    .eq("entity_type", "task")
    .eq("entity_id", taskId)
    .eq("created_by", user.id)
    .select("id, body, edited_at, mentions")
    .maybeSingle();

  if (result.error) return internal(result.error.message);
  if (!result.data) return notFound();
  return NextResponse.json({ data: result.data });
}

async function handleDelete(_req: NextRequest, { params }: Props) {
  const { id: taskId, commentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { error } = await supabase
    .from("comments")
    // @ts-expect-error generic update payload collapses to never
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId)
    .eq("entity_type", "task")
    .eq("entity_id", taskId);
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
    { errors: [{ code: "not_found", message: "Comment not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const PATCH = withObservability<Props>(handlePatch, "PATCH /api/v1/tasks/:id/comments/:commentId");
export const DELETE = withObservability<Props>(handleDelete, "DELETE /api/v1/tasks/:id/comments/:commentId");
