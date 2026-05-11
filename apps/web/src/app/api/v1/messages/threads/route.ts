import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";

/**
 * GET  /api/v1/messages/threads    — threads I can see, newest first
 * POST /api/v1/messages/threads
 *   { kind: "dm", other_user_id }                 → create or reuse a DM
 *   { kind: "terminal", terminal_id }             → create or reuse the terminal's single thread
 */

async function handleGet() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  // Gather all threads visible to me:
  //   - DMs where I'm a participant
  //   - terminal threads for terminals I'm on
  //   - (v2) space threads for spaces I'm in
  const { data: dmRows } = await supabase
    .from("thread_participants")
    .select(
      "thread_id, last_read_at, message_threads!thread_participants_thread_id_fkey(id, kind, terminal_id, space_id, last_message_at)",
    )
    .eq("user_id", user.id);

  type DM = {
    thread_id: string;
    last_read_at: string | null;
    message_threads: {
      id: string;
      kind: "dm" | "terminal" | "space" | "group" | "reminders";
      terminal_id: string | null;
      space_id: string | null;
      last_message_at: string;
    } | null;
  };
  const fromParticipants = ((dmRows ?? []) as unknown as DM[])
    .map((r) => r.message_threads)
    .filter((t): t is NonNullable<DM["message_threads"]> => !!t);

  // Terminal + space channels are visible whenever I'm on the terminal
  // or in the space. RLS handles the access check; fetch both and merge.
  const { data: channelThreads } = await supabase
    .from("message_threads")
    .select("id, kind, terminal_id, space_id, last_message_at")
    .in("kind", ["terminal", "space"]);
  type TT = {
    id: string;
    kind: "dm" | "terminal" | "space" | "group" | "reminders";
    terminal_id: string | null;
    space_id: string | null;
    last_message_at: string;
  };

  const byId = new Map<string, TT>();
  for (const t of fromParticipants) byId.set(t.id, t);
  for (const t of (channelThreads ?? []) as TT[]) byId.set(t.id, t);

  const all = Array.from(byId.values()).sort(
    (a, b) =>
      new Date(b.last_message_at).getTime() -
      new Date(a.last_message_at).getTime(),
  );

  // Decorate each thread with a display label:
  //   DM → the other participant's name
  //   Terminal → the terminal's name + ticker
  const terminalIds = Array.from(
    new Set(
      all
        .filter((t) => t.kind === "terminal" && t.terminal_id)
        .map((t) => t.terminal_id!),
    ),
  );
  const { data: terms } = terminalIds.length
    ? await supabase
        .from("terminals")
        .select("id, ticker, name")
        .in("id", terminalIds)
    : { data: [] };
  type TermRow = { id: string; ticker: string; name: string };
  const termById = new Map(
    ((terms ?? []) as TermRow[]).map((t) => [t.id, t]),
  );

  // DMs and group threads both label by participants — fetch them
  // together. (terminal/space threads label by the terminal/space row.)
  const peopleIds = all
    .filter((t) => t.kind === "dm" || t.kind === "group")
    .map((t) => t.id);
  const { data: dmParticipants } = peopleIds.length
    ? await supabase
        .from("thread_participants")
        .select("thread_id, user_id")
        .in("thread_id", peopleIds)
    : { data: [] };
  type PP = { thread_id: string; user_id: string };
  const partsByThread = new Map<string, string[]>();
  for (const p of (dmParticipants ?? []) as PP[]) {
    if (!partsByThread.has(p.thread_id)) partsByThread.set(p.thread_id, []);
    partsByThread.get(p.thread_id)!.push(p.user_id);
  }
  const otherUserIds = Array.from(
    new Set(
      peopleIds.flatMap(
        (id) => partsByThread.get(id)?.filter((u) => u !== user.id) ?? [],
      ),
    ),
  );
  const { data: profiles } = otherUserIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", otherUserIds)
    : { data: [] };
  type ProfileRow = { user_id: string; full_name: string | null };
  const nameById = new Map(
    ((profiles ?? []) as ProfileRow[]).map((p) => [p.user_id, p.full_name]),
  );

  // Look up space names for `kind='space'` threads so we can label them
  // "#general · Helios".
  const spaceIds = Array.from(
    new Set(
      all
        .filter((t) => t.kind === "space" && t.space_id)
        .map((t) => t.space_id!),
    ),
  );
  const { data: spaceRows } = spaceIds.length
    ? await supabase
        .from("spaces")
        .select("id, slug, name")
        .in("id", spaceIds)
    : { data: [] };
  type SpaceRow = { id: string; slug: string; name: string };
  const spaceById = new Map(
    ((spaceRows ?? []) as SpaceRow[]).map((s) => [s.id, s]),
  );

  const decorated = all.map((t) => {
    if (t.kind === "terminal" && t.terminal_id) {
      const term = termById.get(t.terminal_id);
      return {
        id: t.id,
        kind: t.kind,
        label: term ? `#${term.ticker} · ${term.name}` : "Terminal",
        href_ticker: term?.ticker ?? null,
        last_message_at: t.last_message_at,
      };
    }
    if (t.kind === "space" && t.space_id) {
      const sp = spaceById.get(t.space_id);
      return {
        id: t.id,
        kind: t.kind,
        label: sp ? `#lobby · ${sp.name}` : "#lobby",
        last_message_at: t.last_message_at,
      };
    }
    if (t.kind === "reminders") {
      return {
        id: t.id,
        kind: t.kind,
        label: "Reminders",
        last_message_at: t.last_message_at,
      };
    }
    if (t.kind === "dm" || t.kind === "group") {
      const others = (partsByThread.get(t.id) ?? []).filter(
        (u) => u !== user.id,
      );
      const label =
        others
          .map((u) => nameById.get(u) ?? "someone")
          .join(", ") || (t.kind === "group" ? "Group chat" : "Direct message");
      return {
        id: t.id,
        kind: t.kind,
        label,
        // Group threads have multiple "others"; expose only the first
        // for callers that care (most consumers just use `label`).
        other_user_id: others[0] ?? null,
        last_message_at: t.last_message_at,
      };
    }
    return {
      id: t.id,
      kind: t.kind,
      label: "Channel",
      last_message_at: t.last_message_at,
    };
  });

  return NextResponse.json({ data: decorated });
}

async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    kind?: "dm" | "terminal";
    other_user_id?: string;
    terminal_id?: string;
  };

  if (body.kind === "terminal" && body.terminal_id) {
    // Reuse the single per-terminal thread if it already exists.
    const { data: existing } = await supabase
      .from("message_threads")
      .select("id")
      .eq("kind", "terminal")
      .eq("terminal_id", body.terminal_id)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ data: existing });
    }
    const { data, error } = await supabase
      .from("message_threads")
      // @ts-expect-error generic insert collapses to never
      .insert({ kind: "terminal", terminal_id: body.terminal_id })
      .select("id")
      .single();
    if (error) return internal(error.message);
    return NextResponse.json({ data }, { status: 201 });
  }

  if (body.kind === "dm" && body.other_user_id) {
    if (body.other_user_id === user.id)
      return bad("cannot DM yourself");

    // Find any existing DM where both parties are participants.
    const { data: mine } = await supabase
      .from("thread_participants")
      .select("thread_id, message_threads!thread_participants_thread_id_fkey(id, kind)")
      .eq("user_id", user.id);
    type Row = {
      thread_id: string;
      message_threads: { id: string; kind: string } | null;
    };
    const myDmThreadIds = ((mine ?? []) as unknown as Row[])
      .filter((r) => r.message_threads?.kind === "dm")
      .map((r) => r.thread_id);
    if (myDmThreadIds.length > 0) {
      const { data: shared } = await supabase
        .from("thread_participants")
        .select("thread_id")
        .eq("user_id", body.other_user_id)
        .in("thread_id", myDmThreadIds);
      const reuse = (shared ?? [])[0] as { thread_id: string } | undefined;
      if (reuse) return NextResponse.json({ data: { id: reuse.thread_id } });
    }

    const { data: thread, error: tErr } = await supabase
      .from("message_threads")
      // @ts-expect-error generic insert collapses to never
      .insert({ kind: "dm" })
      .select("id")
      .single();
    if (tErr || !thread) return internal(tErr?.message ?? "thread insert failed");
    const threadId = (thread as { id: string }).id;

    const { error: pErr } = await supabase
      .from("thread_participants")
      // @ts-expect-error generic insert collapses to never
      .insert([
        { thread_id: threadId, user_id: user.id },
        { thread_id: threadId, user_id: body.other_user_id },
      ]);
    if (pErr) return internal(pErr.message);
    return NextResponse.json({ data: { id: threadId } }, { status: 201 });
  }

  return bad("kind must be 'dm' with other_user_id, or 'terminal' with terminal_id");
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

export const GET = withObservability(
  handleGet,
  "GET /api/v1/messages/threads",
);
export const POST = withObservability(
  handlePost,
  "POST /api/v1/messages/threads",
);
