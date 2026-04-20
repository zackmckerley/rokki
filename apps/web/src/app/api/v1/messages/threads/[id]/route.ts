import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET  /api/v1/messages/threads/:id  — messages in a thread, oldest first
 * POST /api/v1/messages/threads/:id  { body }  — post a new message
 */

export async function GET(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data } = await supabase
    .from("messages")
    .select("id, author_id, body, created_at, edited_at, deleted_at")
    .eq("thread_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  type Row = {
    id: string;
    author_id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
  };
  const rows = (data ?? []) as Row[];
  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const { data: profiles } = authorIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", authorIds)
    : { data: [] };
  type ProfileRow = { user_id: string; full_name: string | null };
  const nameById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.user_id, p.full_name]),
  );
  const decorated = rows.map((r) => ({
    ...r,
    author_name: nameById.get(r.author_id) ?? "someone",
  }));

  // Best effort: mark my last_read_at to "now" so unread counts drop.
  await supabase
    .from("thread_participants")
    // @ts-expect-error generic update collapses to never
    .update({ last_read_at: new Date().toISOString() })
    .eq("thread_id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ data: decorated });
}

export async function POST(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as { body?: string };
  const text = (body.body ?? "").trim();
  if (!text || text.length > 10_000)
    return bad("body must be 1–10,000 chars");

  const { data, error } = await supabase
    .from("messages")
    // @ts-expect-error generic insert collapses to never
    .insert({ thread_id: id, author_id: user.id, body: text })
    .select("id, created_at")
    .single();
  if (error) return internal(error.message);
  return NextResponse.json({ data }, { status: 201 });
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
