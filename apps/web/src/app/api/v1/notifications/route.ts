import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET  /api/v1/notifications?unread=1&limit=50  — your notifications feed
 * PATCH /api/v1/notifications  { ids?: string[], all?: true, read?: boolean }
 *   → mark one, many, or all as read (or unread). Users can only touch
 *     their own rows (RLS enforced).
 */

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1";
  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit") ?? 30)),
  );

  let q = supabase
    .from("notifications")
    .select(
      "id, kind, title, body, entity_type, entity_id, terminal_id, actor_id, url, read_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (unreadOnly) q = q.is("read_at", null);

  const { data, error } = await q;
  if (error) return internal(error.message);

  // Resolve terminal_id → { ticker, name } in a single batch fetch so the
  // client can group notifications under their parent terminal heading
  // without N+1 round-trips. RLS already restricts terminals to those the
  // user can see; orphan ids (terminal archived / out of scope) drop into
  // the "System" group on the client.
  type Row = {
    id: string;
    terminal_id: string | null;
    [k: string]: unknown;
  };
  const rows = (data ?? []) as Row[];
  const terminalIds = Array.from(
    new Set(
      rows
        .map((r) => r.terminal_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  );

  type TerminalLite = { id: string; ticker: string; name: string };
  let terminalMap = new Map<string, { ticker: string; name: string }>();
  if (terminalIds.length > 0) {
    const { data: terms } = await supabase
      .from("terminals")
      .select("id, ticker, name")
      .in("id", terminalIds);
    terminalMap = new Map(
      ((terms ?? []) as TerminalLite[]).map((t) => [
        t.id,
        { ticker: t.ticker, name: t.name },
      ]),
    );
  }

  const enriched = rows.map((r) => ({
    ...r,
    terminal: r.terminal_id ? (terminalMap.get(r.terminal_id) ?? null) : null,
  }));

  // Also return unread count so the bell badge stays in sync.
  const { count: unreadCount } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  return NextResponse.json({
    data: enriched,
    unread_count: unreadCount ?? 0,
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    ids?: string[];
    all?: boolean;
    read?: boolean;
  };
  const read = body.read !== false; // default true
  const stamp = read ? new Date().toISOString() : null;

  let q = supabase
    .from("notifications")
    // @ts-expect-error generic update payload collapses to never
    .update({ read_at: stamp });
  if (body.all) {
    q = q.is("read_at", null);
  } else if (Array.isArray(body.ids) && body.ids.length > 0) {
    q = q.in("id", body.ids);
  } else {
    return bad("pass ids[] or all=true");
  }
  const { error } = await q;
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
