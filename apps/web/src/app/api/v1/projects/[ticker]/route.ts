import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events";
import { resolveTerminalBySegment } from "@/lib/resolve-terminal";
import type { ProjectStatus } from "@rokki/db";

import { withObservability } from "@/lib/observability";
interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * GET    /api/v1/projects/:ticker
 * PATCH  /api/v1/projects/:ticker  { name?, description?, status?, metadata? }
 * DELETE /api/v1/projects/:ticker    — archive (soft)
 *
 * Only terminal owners/managers can mutate. Hard-delete is not exposed via
 * the API; archived terminals filter out of lists via `is("archived_at", null)`
 * but remain queryable by id for audit. An explicit "restore" endpoint is
 * not provided yet — a platform admin can clear `archived_at` directly if
 * someone asks.
 */

const VALID_STATUSES: ProjectStatus[] = [
  "planning",
  "active",
  "blocked",
  "done",
  "archived",
];

async function handleGet(_req: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  // Resolve by slug first, then ticker — the URL segment is named
  // `ticker` for historical reasons but now carries the slug.
  const resolved = await resolveTerminalBySegment(supabase, ticker);
  if (!resolved) return notFound();
  const { data } = await supabase
    .from("terminals")
    .select(
      "id, space_id, slug, ticker, name, description, type, status, metadata, created_at, updated_at, archived_at",
    )
    .eq("id", resolved.id)
    .maybeSingle();

  if (!data) return notFound();
  return NextResponse.json({ data });
}

async function handlePatch(request: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const terminal = await resolveTerminal(supabase, ticker);
  if (!terminal) return notFound();

  // Owner / manager on the terminal, or owner / admin on the space, may edit.
  const allowed = await canManageTerminal(supabase, terminal, user.id);
  if (!allowed) return forbidden("only terminal owners/managers can edit");

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    description?: string | null;
    status?: ProjectStatus;
    metadata?: Record<string, unknown>;
  };

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (n.length < 1 || n.length > 200)
      return bad("name must be 1–200 characters");
    patch.name = n;
  }
  if (body.description === null || typeof body.description === "string") {
    if (typeof body.description === "string" && body.description.length > 2000)
      return bad("description must be ≤2000 characters");
    patch.description = body.description;
  }
  if (typeof body.status === "string") {
    if (!VALID_STATUSES.includes(body.status))
      return bad(`status must be one of ${VALID_STATUSES.join(", ")}`);
    patch.status = body.status;
  }
  if (body.metadata && typeof body.metadata === "object") {
    patch.metadata = body.metadata;
  }

  if (Object.keys(patch).length === 0) return bad("no patchable fields given");

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("terminals")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .update(patch)
    .eq("id", terminal.id)
    .select(
      "id, space_id, ticker, name, description, type, status, metadata, updated_at",
    )
    .single();

  if (error || !data) return internal(error?.message ?? "update failed");

  void emitEvent("terminal.updated", {
    actor_id: user.id,
    space_id: terminal.space_id,
    terminal_id: terminal.id,
    entity_type: "terminal",
    entity_id: terminal.id,
    payload: { fields: Object.keys(patch).filter((k) => k !== "updated_at") },
  });

  return NextResponse.json({ data });
}

async function handleDelete(_req: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const terminal = await resolveTerminal(supabase, ticker);
  if (!terminal) return notFound();

  const allowed = await canManageTerminal(supabase, terminal, user.id);
  if (!allowed) return forbidden("only terminal owners can archive");

  const { error } = await supabase
    .from("terminals")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .update({
      archived_at: new Date().toISOString(),
      status: "archived",
      updated_at: new Date().toISOString(),
    })
    .eq("id", terminal.id);

  if (error) return internal(error.message);

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: terminal.id,
      space_id: terminal.space_id,
      actor_id: user.id,
      action: "terminal.archive",
      entity_type: "terminal",
      entity_id: terminal.id,
      metadata: { ticker: terminal.ticker },
    });

  void emitEvent("terminal.archived", {
    actor_id: user.id,
    space_id: terminal.space_id,
    terminal_id: terminal.id,
    entity_type: "terminal",
    entity_id: terminal.id,
    payload: { ticker: terminal.ticker },
  });

  return NextResponse.json({ data: { archived: true } });
}

async function resolveTerminal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticker: string,
) {
  // Delegate to the central slug-or-ticker resolver. The local
  // wrapper stays so the call sites don't have to change.
  return resolveTerminalBySegment(supabase, ticker);
}

async function canManageTerminal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  terminal: { id: string; space_id: string },
  userId: string,
) {
  const [{ data: tm }, { data: sm }] = await Promise.all([
    supabase
      .from("terminal_members")
      .select("role")
      .eq("terminal_id", terminal.id)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("space_members")
      .select("role")
      .eq("space_id", terminal.space_id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  const trole = (tm as { role?: string } | null)?.role;
  const srole = (sm as { role?: string } | null)?.role;
  return (
    trole === "owner" ||
    trole === "manager" ||
    srole === "owner" ||
    srole === "admin"
  );
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
function forbidden(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "forbidden", message: msg }] },
    { status: 403 },
  );
}
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Terminal not found" }] },
    { status: 404 },
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
  "GET /api/v1/projects/:ticker",
);
export const PATCH = withObservability<Props>(
  handlePatch,
  "PATCH /api/v1/projects/:ticker",
);
export const DELETE = withObservability<Props>(
  handleDelete,
  "DELETE /api/v1/projects/:ticker",
);
