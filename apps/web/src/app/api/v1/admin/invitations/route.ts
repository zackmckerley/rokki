import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/v1/admin/invitations
 *   ?filter=  "pending" (default) | "expired" | "all"
 *
 * Lists invitations across the platform with associated space/terminal
 * names so the admin can resend or revoke.
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const filter = url.searchParams.get("filter") ?? "pending";

  let query = admin
    .from("invites")
    .select(
      "id, email, role, space_id, terminal_id, invited_at, expires_at, accepted_at, accepted_by, invited_by",
    )
    .order("invited_at", { ascending: false })
    .limit(500);

  const now = new Date().toISOString();
  if (filter === "pending") {
    query = query.is("accepted_at", null).gt("expires_at", now);
  } else if (filter === "expired") {
    query = query.is("accepted_at", null).lte("expires_at", now);
  }
  // "all" = no extra filters

  const { data, error } = await query;
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  const invites = (data ?? []) as Array<{
    id: string;
    email: string;
    role: string;
    space_id: string | null;
    terminal_id: string | null;
    invited_at: string;
    expires_at: string;
    accepted_at: string | null;
    accepted_by: string | null;
    invited_by: string;
  }>;

  // Hydrate space + terminal labels.
  const spaceIds = Array.from(
    new Set(invites.map((i) => i.space_id).filter(Boolean) as string[]),
  );
  const terminalIds = Array.from(
    new Set(invites.map((i) => i.terminal_id).filter(Boolean) as string[]),
  );
  const [{ data: spaces }, { data: terminals }] = await Promise.all([
    spaceIds.length
      ? admin.from("spaces").select("id, slug, name").in("id", spaceIds)
      : { data: [] },
    terminalIds.length
      ? admin
          .from("terminals")
          .select("id, ticker, name")
          .in("id", terminalIds)
      : { data: [] },
  ]);
  const spaceMap = new Map(
    ((spaces ?? []) as { id: string; slug: string; name: string }[]).map(
      (s) => [s.id, { slug: s.slug, name: s.name }],
    ),
  );
  const termMap = new Map(
    ((terminals ?? []) as { id: string; ticker: string; name: string }[]).map(
      (t) => [t.id, { ticker: t.ticker, name: t.name }],
    ),
  );

  return NextResponse.json({
    data: invites.map((i) => ({
      ...i,
      space: i.space_id ? spaceMap.get(i.space_id) ?? null : null,
      terminal: i.terminal_id ? termMap.get(i.terminal_id) ?? null : null,
    })),
  });
}
