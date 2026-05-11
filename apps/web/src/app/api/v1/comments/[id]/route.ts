import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mentionedUserIds } from "@/lib/mentions";
import { withObservability } from "@/lib/observability";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/v1/comments/:id  { body }   — edit your own comment
 * DELETE /api/v1/comments/:id            — soft delete (sets deleted_at)
 */
async function handlePatch(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    body?: string;
    /**
     * Optimistic-concurrency token. We check against the comment's
     * `edited_at` on the server (`null` is sent as the empty string from
     * the client; both forms are accepted here). If supplied and the
     * server has moved on, we return 409 with the current row plus what
     * the user attempted, so the conflict dialog can mediate.
     */
    expected_edited_at?: string | null;
  };
  const content = (body.body ?? "").trim();
  if (content.length < 1 || content.length > 20_000)
    return bad("body must be 1–20,000 chars");

  const expected =
    body.expected_edited_at ?? request.headers.get("if-match") ?? null;

  if (expected !== null) {
    const { data: cur } = await supabase
      .from("comments")
      .select(
        "id, entity_type, entity_id, terminal_id, parent_id, body, mentions, created_at, edited_at, deleted_at, created_by",
      )
      .eq("id", id)
      .eq("created_by", user.id)
      .maybeSingle();
    const row = cur as { edited_at: string | null } | null;
    if (!row) return notFound();
    // Treat "" and null interchangeably so the client can ship either.
    const have = row.edited_at ?? "";
    const want = expected ?? "";
    if (have !== want) {
      return NextResponse.json(
        {
          errors: [
            {
              code: "conflict",
              message: "Comment changed since you started editing.",
            },
          ],
          current: cur,
          attempted: { body: content },
        },
        { status: 409 },
      );
    }
  }

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

async function handleDelete(_req: NextRequest, { params }: Props) {
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

export const PATCH = withObservability<Props>(
  handlePatch,
  "PATCH /api/v1/comments/:id",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/comments/:id",
);
