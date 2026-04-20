import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emitEvent } from "@/lib/events";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/v1/approvals/:id  { status: "approved" | "denied", note? }
 *
 * Only space owners/admins of the approval's `approver_space_id` may act.
 */
export async function PATCH(request: NextRequest, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    status?: "approved" | "denied";
    note?: string;
  };
  if (body.status !== "approved" && body.status !== "denied")
    return bad("status must be 'approved' or 'denied'");

  const { data: existing } = await supabase
    .from("approvals")
    .select(
      "id, type, approver_space_id, subject_type, subject_id, requester_id, status",
    )
    .eq("id", id)
    .maybeSingle();
  const row = existing as
    | {
        id: string;
        type: string;
        approver_space_id: string | null;
        subject_type: string;
        subject_id: string;
        requester_id: string;
        status: string;
      }
    | null;
  if (!row) return notFound();
  if (row.status !== "pending") return bad("already resolved");

  if (row.approver_space_id) {
    const { data: me } = await supabase
      .from("space_members")
      .select("role")
      .eq("space_id", row.approver_space_id)
      .eq("user_id", user.id)
      .maybeSingle();
    const role = (me as { role?: string } | null)?.role;
    if (role !== "owner" && role !== "admin") return forbidden();
  } else {
    // Approver is ambiguous; require platform admin as a safety net.
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!(prof as { is_platform_admin?: boolean } | null)?.is_platform_admin)
      return forbidden();
  }

  const { error } = await supabase
    .from("approvals")
    // @ts-expect-error Phase 0 generics
    .update({
      status: body.status,
      note: body.note ?? null,
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
    })
    .eq("id", id);
  if (error) return internal(error.message);

  void emitEvent("approval.resolved", {
    actor_id: user.id,
    space_id: row.approver_space_id ?? undefined,
    entity_type: "approval",
    entity_id: id,
    payload: {
      decision: body.status,
      type: row.type,
      subject_id: row.subject_id,
    },
  });

  return NextResponse.json({ data: { id, status: body.status } });
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
function forbidden() {
  return NextResponse.json(
    { errors: [{ code: "forbidden", message: "You cannot resolve this approval" }] },
    { status: 403 },
  );
}
function notFound() {
  return NextResponse.json(
    { errors: [{ code: "not_found", message: "Approval not found" }] },
    { status: 404 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}
