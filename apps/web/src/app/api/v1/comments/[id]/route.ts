import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mentionedUserIds } from "@/lib/mentions";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/v1/comments/:id  { body }   — edit your own comment
 * DELETE /api/v1/comments/:id            — soft delete (sets deleted_at)
 */
export async function PATCH(request: NextRequest, { params }: Props) {
  const { id } = await params;
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
  const { data, error } = await supabase
    .from("comments")
    // @ts-expect-error generic update payload collapses to never
    .update({
      body: content,
      mentions,
      edited_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("created_by", user.id)
    .select("id, body, edited_at")
    .maybeSingle();
  if (error) return internal(error.message);
  if (!data) return notFound();
  return NextResponse.json({ data });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { error } = await supabase
    .from("comments")
    // @ts-expect-error generic update payload collapses to never
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("created_by", user.id);
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
    { errors: [{ code: "not_found", message: "Not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}
