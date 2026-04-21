import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/v1/me/announcements
 *   Returns active announcements visible to the caller, with the
 *   user's dismissal state. The client should hide ones in `dismissed`.
 *
 *   Audience rules:
 *     - audience='all'    → visible to everyone
 *     - audience='admins' → only platform admins
 *     - audience='space'  → only members of the targeted space
 */
export async function GET(_request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );

  const now = new Date().toISOString();
  const { data: ann } = await supabase
    .from("announcements")
    .select(
      "id, body, audience, audience_space_id, starts_at, ends_at, dismissible, created_at",
    )
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .order("starts_at", { ascending: false })
    .limit(50);

  const rows = (ann ?? []) as Array<{
    id: string;
    body: string;
    audience: "all" | "admins" | "space";
    audience_space_id: string | null;
    starts_at: string;
    ends_at: string | null;
    dismissible: boolean;
    created_at: string;
  }>;

  // Filter by audience.
  let isAdmin = false;
  let memberSpaceIds: string[] = [];
  if (rows.some((r) => r.audience === "admins")) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("user_id", user.id)
      .maybeSingle();
    isAdmin = Boolean(
      (prof as { is_platform_admin?: boolean } | null)?.is_platform_admin,
    );
  }
  if (rows.some((r) => r.audience === "space")) {
    const { data: members } = await supabase
      .from("space_members")
      .select("space_id")
      .eq("user_id", user.id);
    memberSpaceIds = ((members ?? []) as { space_id: string }[]).map(
      (m) => m.space_id,
    );
  }

  const visible = rows.filter((r) => {
    if (r.audience === "all") return true;
    if (r.audience === "admins") return isAdmin;
    if (r.audience === "space")
      return r.audience_space_id
        ? memberSpaceIds.includes(r.audience_space_id)
        : false;
    return false;
  });

  // Dismissals
  const ids = visible.map((v) => v.id);
  const { data: dismissals } = ids.length
    ? await supabase
        .from("announcement_dismissals")
        .select("announcement_id")
        .in("announcement_id", ids)
        .eq("user_id", user.id)
    : { data: [] };
  const dismissed = new Set(
    ((dismissals ?? []) as { announcement_id: string }[]).map(
      (d) => d.announcement_id,
    ),
  );

  return NextResponse.json({
    data: visible.map((v) => ({ ...v, dismissed: dismissed.has(v.id) })),
  });
}
