import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/approvals?scope=mine|inbox
 *
 *   - scope=mine  → approvals I requested
 *   - scope=inbox → approvals awaiting my action (I'm an owner/admin of
 *                   the approver_space_id)
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const scope = (url.searchParams.get("scope") ?? "mine") as "mine" | "inbox";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  let query = supabase
    .from("approvals")
    .select(
      "id, type, requester_id, approver_space_id, subject_type, subject_id, status, context, requested_at, resolved_at, resolved_by, note, expires_at",
    )
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("requested_at", { ascending: false });

  if (scope === "mine") {
    query = query.eq("requester_id", user.id);
  } else {
    // Inbox: approvals whose approver_space_id I'm an owner/admin of.
    const { data: memberships } = await supabase
      .from("space_members")
      .select("space_id, role")
      .eq("user_id", user.id)
      .in("role", ["owner", "admin"]);
    const ids = ((memberships ?? []) as { space_id: string }[]).map(
      (m) => m.space_id,
    );
    if (ids.length === 0) return NextResponse.json({ data: [] });
    query = query.in("approver_space_id", ids);
  }

  const { data, error } = await query;
  if (error) return internal(error.message);
  return NextResponse.json({ data: data ?? [] });
}

function unauth() {
  return NextResponse.json(
    { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
    { status: 401 },
  );
}
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}
