import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * POST /api/v1/admin/terminals/:ticker/transfer-owner
 *   { new_owner_user_id }
 *
 * The target must already be a terminal_member. We promote them to owner
 * and demote existing owners to manager. (Multiple owners are allowed by
 * schema, but the convention is one.)
 */
export async function POST(request: NextRequest, { params }: Props) {
  const { ticker } = await params;
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    new_owner_user_id?: string;
  };
  const newOwner = body.new_owner_user_id?.trim();
  if (!newOwner)
    return bad("new_owner_user_id required");

  const { data: terminal } = await admin
    .from("terminals")
    .select("id, ticker, space_id")
    .eq("ticker", ticker.toUpperCase())
    .maybeSingle();
  if (!terminal)
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Terminal not found" }] },
      { status: 404 },
    );
  const t = terminal as { id: string; ticker: string; space_id: string };

  const { data: existing } = await admin
    .from("terminal_members")
    .select("user_id")
    .eq("terminal_id", t.id)
    .eq("user_id", newOwner)
    .maybeSingle();
  if (!existing) {
    return bad("Target user is not a member of this terminal; add them first.");
  }

  await admin
    .from("terminal_members")
    .update({ role: "manager" } as never)
    .eq("terminal_id", t.id)
    .eq("role", "owner");

  await admin
    .from("terminal_members")
    .update({ role: "owner" } as never)
    .eq("terminal_id", t.id)
    .eq("user_id", newOwner);

  void emitEvent("admin.terminal.owner_transferred", {
    actor_id: actorId,
    space_id: t.space_id,
    terminal_id: t.id,
    entity_type: "terminal",
    entity_id: t.id,
    payload: { new_owner: newOwner },
  });

  return NextResponse.json({
    data: { terminal_id: t.id, owner: newOwner },
  });
}

function bad(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "invalid_request", message: msg }] },
    { status: 400 },
  );
}
