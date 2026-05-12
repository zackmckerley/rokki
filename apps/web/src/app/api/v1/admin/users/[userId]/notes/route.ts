import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ userId: string }>;
}

/**
 * GET  /api/v1/admin/users/:userId/notes  → list of admin notes + author email
 * POST /api/v1/admin/users/:userId/notes  { body }
 */
async function handleGet(request: NextRequest, { params }: Props) {
  const { userId } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const { data } = await admin
    .from("admin_notes")
    .select("id, body, author_user_id, created_at")
    .eq("target_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as Array<{
    id: string;
    body: string;
    author_user_id: string;
    created_at: string;
  }>;
  const authorIds = Array.from(new Set(rows.map((r) => r.author_user_id)));
  const { data: authors } = authorIds.length
    ? await admin
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", authorIds)
    : { data: [] };
  const map = new Map(
    ((authors ?? []) as { user_id: string; full_name: string | null }[]).map(
      (a) => [a.user_id, a.full_name],
    ),
  );

  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      author_name: map.get(r.author_user_id) ?? "(admin)",
    })),
  });
}

async function handlePost(request: NextRequest, { params }: Props) {
  const { userId } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as { body?: string };
  const text = (body.body ?? "").trim();
  if (!text || text.length > 4000) return bad("body must be 1–4000 chars");

  const { data, error } = await admin
    .from("admin_notes")
    .insert({
      target_user_id: userId,
      author_user_id: actorId,
      body: text,
    } as never)
    .select("id, body, author_user_id, created_at")
    .single();
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  return NextResponse.json({ data }, { status: 201 });
}

function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/admin/users/:userId/notes",
);
export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/admin/users/:userId/notes",
);
