import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidTicker, suggestTicker, uniqueTicker } from "@/lib/ticker";
import { emitEvent } from "@/lib/events";
import type { ProjectStatus } from "@rokki/db";

import { withObservability } from "@/lib/observability";
/**
 * GET  /api/v1/projects                       — all accessible projects
 * POST /api/v1/projects  { space_id, name, ticker?, description?, type?, metadata? }
 *
 * See docs/02_API.md §2.6.
 */
async function handleGet() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data, error } = await supabase
    .from("terminals")
    .select(
      "id, space_id, ticker, name, description, type, status, metadata, created_at, updated_at",
    )
    .is("archived_at", null)
    .order("updated_at", { ascending: false });

  if (error) return internal(error.message);
  return NextResponse.json({ data });
}

async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    space_id?: string;
    name?: string;
    ticker?: string;
    description?: string | null;
    type?: string;
    status?: ProjectStatus;
    metadata?: Record<string, unknown>;
  };

  if (!body.space_id || !body.name) return bad("space_id and name are required");
  if (body.name.length < 1 || body.name.length > 200)
    return bad("name must be 1–200 characters");

  // `type` is a free-form tag the user can set later (category, vertical, etc.).
  // No longer gates UI behavior — every space gets the same universal core.
  const type = body.type ?? "space";

  // Any member of the parent space can create terminals. The
  // `trg_terminal_init_members` DB trigger seeds terminal_members
  // with the creator (role='owner') AND every space owner
  // (role='owner') so both have admin control of the new terminal.
  // Old rule was owner/admin-only; relaxed per Zack — regular space
  // members are who actually need to start working contexts.
  const { data: membership } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", body.space_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership)
    return forbidden("you are not a member of this space");

  // Resolve ticker: use provided, or auto-suggest + dedupe against existing
  let ticker = body.ticker?.toUpperCase();
  if (ticker && !isValidTicker(ticker))
    return bad("ticker must be 2–10 uppercase letters/digits, start with letter");

  if (!ticker) {
    const suggested = suggestTicker(body.name);
    const { data: taken } = await supabase
      .from("terminals")
      .select("ticker")
      .eq("space_id", body.space_id);
    const takenTickers = ((taken ?? []) as { ticker: string }[]).map(
      (row) => row.ticker,
    );
    ticker = uniqueTicker(suggested, takenTickers);
  }

  const result = await supabase
    .from("terminals")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      space_id: body.space_id,
      ticker,
      name: body.name,
      description: body.description ?? null,
      type,
      status: body.status ?? "planning",
      metadata: body.metadata ?? {},
      created_by: user.id,
    })
    .select(
      "id, space_id, slug, ticker, name, description, type, status, metadata, created_at",
    )
    .single();

  const data = result.data as
    | {
        id: string;
        space_id: string;
        slug: string;
        ticker: string;
        name: string;
      }
    | null;
  const error = result.error;

  if (error || !data) {
    if (error?.code === "23505") return conflict("ticker already taken in this org");
    return internal(error?.message ?? "insert failed");
  }

  // Write activity for the ticker tape (service-role would be cleaner; skip on failure)
  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: data.id,
      space_id: data.space_id,
      actor_id: user.id,
      action: "terminal.create",
      entity_type: "project",
      entity_id: data.id,
      metadata: { ticker: data.ticker, name: data.name },
    });

  void emitEvent("terminal.created", {
    actor_id: user.id,
    space_id: data.space_id,
    terminal_id: data.id,
    entity_type: "terminal",
    entity_id: data.id,
    payload: { ticker: data.ticker, name: data.name },
  });

  return NextResponse.json({ data }, { status: 201 });
}

// -----------------------------------------------------------------------------

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
function forbidden(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "forbidden", message: msg }] },
    { status: 403 },
  );
}
function conflict(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "conflict", message: msg }] },
    { status: 409 },
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
  "GET /api/v1/projects",
);
export const POST = withObservability(
  handlePost,
  "POST /api/v1/projects",
);
