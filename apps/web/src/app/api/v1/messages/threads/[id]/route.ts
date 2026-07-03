import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * GET  /api/v1/messages/threads/:id  — messages in a thread, oldest first
 * POST /api/v1/messages/threads/:id  { body }  — post a new message
 */

async function handleGet(_req: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  // Cap at the most recent 200 messages — an unbounded fetch grew linearly
  // with thread length and dominated inbox load on long threads. Fetch newest
  // first with a limit, then flip back to oldest-first for rendering.
  const { data } = await supabase
    .from("messages")
    .select(
      "id, author_id, body, created_at, edited_at, deleted_at, pinging_task_id",
    )
    .eq("thread_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  type Row = {
    id: string;
    author_id: string;
    body: string;
    created_at: string;
    edited_at: string | null;
    deleted_at: string | null;
    pinging_task_id: string | null;
  };
  const rows = ((data ?? []) as Row[]).slice().reverse();
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

  // Decorate any "request update" pings (pinging_task_id != null) with the
  // referenced task's title + ticker so the inbox can render a chip and
  // a deep-link to the task. One follow-up query, batched by task_id.
  const taskIds = Array.from(
    new Set(rows.map((r) => r.pinging_task_id).filter((x): x is string => !!x)),
  );
  type TaskRef = {
    id: string;
    ticker_seq: number;
    title: string;
    terminal_id: string;
    terminals: { ticker: string } | { ticker: string }[] | null;
  };
  let taskById = new Map<
    string,
    { id: string; ticker_seq: number; title: string; ticker: string }
  >();
  if (taskIds.length > 0) {
    const { data: taskRows } = await supabase
      .from("tasks")
      .select("id, ticker_seq, title, terminal_id, terminals(ticker)")
      .in("id", taskIds);
    for (const row of (taskRows ?? []) as TaskRef[]) {
      const term = Array.isArray(row.terminals) ? row.terminals[0] : row.terminals;
      taskById.set(row.id, {
        id: row.id,
        ticker_seq: row.ticker_seq,
        title: row.title,
        ticker: term?.ticker ?? "",
      });
    }
  }

  const decorated = rows.map((r) => ({
    ...r,
    author_name: nameById.get(r.author_id) ?? "someone",
    is_mine: r.author_id === user.id,
    pinging_task: r.pinging_task_id ? taskById.get(r.pinging_task_id) ?? null : null,
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

async function handlePost(request: NextRequest, { params }: Props) {
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

export const GET = withObservability<Props>(
  handleGet,
  "GET /api/v1/messages/threads/:id",
);
export const POST = withObservability<Props>(
  handlePost,
  "POST /api/v1/messages/threads/:id",
);
