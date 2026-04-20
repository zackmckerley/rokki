import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events";
import { revokeSessions } from "@/lib/revocations";
import type { ProjectRole } from "@rokki/db";

interface Props {
  params: Promise<{ ticker: string; userId: string }>;
}

/**
 * PATCH  /api/v1/projects/:ticker/members/:userId  { role }
 * DELETE /api/v1/projects/:ticker/members/:userId
 *
 * Only terminal owners/managers can change roles or remove members. An owner
 * cannot demote or remove themselves if they're the sole owner — the UI
 * should surface the "promote someone else first" error.
 */

const VALID_ROLES: ProjectRole[] = [
  "owner",
  "manager",
  "architect",
  "gc",
  "lender",
  "family",
  "guest",
];

export async function PATCH(request: NextRequest, { params }: Props) {
  const { ticker, userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const terminal = await resolveTerminal(supabase, ticker);
  if (!terminal) return notFound();

  const caller = await callerRole(supabase, terminal, user.id);
  if (caller !== "owner" && caller !== "manager")
    return forbidden("only owners or managers can change roles");

  const body = (await request.json().catch(() => ({}))) as { role?: ProjectRole };
  if (!body.role || !VALID_ROLES.includes(body.role))
    return bad(`role must be one of ${VALID_ROLES.join(", ")}`);

  // Prevent the last owner from demoting themselves.
  if (userId === user.id && body.role !== "owner") {
    const { count } = await supabase
      .from("terminal_members")
      .select("user_id", { count: "exact", head: true })
      .eq("terminal_id", terminal.id)
      .eq("role", "owner");
    if ((count ?? 0) <= 1)
      return bad("promote another member to owner before demoting yourself");
  }

  const { error } = await supabase
    .from("terminal_members")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .update({ role: body.role })
    .eq("terminal_id", terminal.id)
    .eq("user_id", userId);

  if (error) return internal(error.message);

  void emitEvent("terminal.member.role_changed", {
    actor_id: user.id,
    space_id: terminal.space_id,
    terminal_id: terminal.id,
    entity_type: "user",
    entity_id: userId,
    payload: { role: body.role },
  });

  return NextResponse.json({ data: { user_id: userId, role: body.role } });
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const { ticker, userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const terminal = await resolveTerminal(supabase, ticker);
  if (!terminal) return notFound();

  const caller = await callerRole(supabase, terminal, user.id);
  // Self-removal is allowed for any member. Everyone else requires owner/manager.
  if (userId !== user.id && caller !== "owner" && caller !== "manager")
    return forbidden("only owners or managers can remove members");

  // Prevent the last owner from removing themselves.
  if (userId === user.id) {
    const { count } = await supabase
      .from("terminal_members")
      .select("user_id", { count: "exact", head: true })
      .eq("terminal_id", terminal.id)
      .eq("role", "owner");
    if (caller === "owner" && (count ?? 0) <= 1)
      return bad("promote another member to owner before leaving");
  }

  const { error } = await supabase
    .from("terminal_members")
    .delete()
    .eq("terminal_id", terminal.id)
    .eq("user_id", userId);

  if (error) return internal(error.message);

  await supabase
    .from("activity")
    // @ts-expect-error Phase 0 — Database<generic> inference collapses to never
    .insert({
      terminal_id: terminal.id,
      space_id: terminal.space_id,
      actor_id: user.id,
      action: "member.remove",
      entity_type: "user",
      entity_id: userId,
      metadata: { self: userId === user.id },
    });

  void emitEvent("terminal.member.removed", {
    actor_id: user.id,
    space_id: terminal.space_id,
    terminal_id: terminal.id,
    entity_type: "user",
    entity_id: userId,
    payload: { self: userId === user.id },
  });

  // Fire the revocation. Only for non-self removals — you don't need to
  // push someone off their own session when they themselves are leaving.
  if (userId !== user.id) {
    void revokeSessions(supabase, {
      userId,
      reason: "terminal_member_removed",
      scopeType: "terminal",
      scopeId: terminal.id,
    });
  }

  return NextResponse.json({ data: { removed: true } });
}

async function resolveTerminal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ticker: string,
) {
  const { data } = await supabase
    .from("terminals")
    .select("id, space_id, ticker")
    .eq("ticker", ticker.toUpperCase())
    .is("archived_at", null)
    .maybeSingle();
  return data as { id: string; space_id: string; ticker: string } | null;
}

async function callerRole(
  supabase: Awaited<ReturnType<typeof createClient>>,
  terminal: { id: string },
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("terminal_members")
    .select("role")
    .eq("terminal_id", terminal.id)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role?: string } | null)?.role ?? null;
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
