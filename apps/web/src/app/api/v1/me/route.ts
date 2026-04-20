import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateBearer } from "@/lib/api-auth";

/**
 * GET   /api/v1/me                 — my profile + preferences
 * PATCH /api/v1/me  { full_name?, avatar_url?, timezone?, preferences? }
 *
 * Scoped to the signed-in user. Preferences merge into the existing jsonb
 * so partial updates don't clobber unrelated keys.
 */

export async function GET(request: NextRequest) {
  // Accept cookie OR bearer so the CLI can call /me. Bearer uses admin
  // client but we still filter by user_id.
  const bearer = await validateBearer(request);
  if (bearer) {
    const { data } = await bearer.admin
      .from("profiles")
      .select(
        "user_id, full_name, avatar_url, timezone, settings, preferences, is_platform_admin, created_at",
      )
      .eq("user_id", bearer.userId)
      .maybeSingle();
    const { data: userRow } = await bearer.admin.auth.admin.getUserById(
      bearer.userId,
    );
    return NextResponse.json({
      data: {
        user_id: bearer.userId,
        email: userRow.user?.email,
        ...((data as object | null) ?? {}),
      },
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data } = await supabase
    .from("profiles")
    .select(
      "user_id, full_name, avatar_url, timezone, settings, preferences, is_platform_admin, created_at",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    data: {
      user_id: user.id,
      email: user.email,
      ...((data as object | null) ?? {}),
    },
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    full_name?: string;
    avatar_url?: string | null;
    timezone?: string | null;
    preferences?: Record<string, unknown>;
  };

  const patch: Record<string, unknown> = {};
  if (typeof body.full_name === "string") {
    const name = body.full_name.trim();
    if (name.length > 120) return bad("full_name must be ≤ 120 chars");
    patch.full_name = name || null;
  }
  if (body.avatar_url !== undefined) {
    if (body.avatar_url && body.avatar_url.length > 500)
      return bad("avatar_url must be ≤ 500 chars");
    patch.avatar_url = body.avatar_url || null;
  }
  if (body.timezone !== undefined) {
    const tz = body.timezone;
    if (tz && (tz.length > 60 || !/^[A-Za-z_/+\-0-9]+$/.test(tz)))
      return bad("timezone must be a valid IANA id (e.g. America/New_York)");
    patch.timezone = tz || null;
  }

  if (body.preferences && typeof body.preferences === "object") {
    // Merge shallowly with the stored prefs — frontend can patch a single
    // sub-object without sending the whole tree back.
    const { data: current } = await supabase
      .from("profiles")
      .select("preferences")
      .eq("user_id", user.id)
      .maybeSingle();
    const base =
      ((current as { preferences?: Record<string, unknown> } | null)
        ?.preferences ?? {}) as Record<string, unknown>;
    patch.preferences = deepMerge(base, body.preferences);
  }

  if (Object.keys(patch).length === 0) return bad("nothing to update");

  const { error } = await supabase
    .from("profiles")
    // @ts-expect-error generic update collapses to never
    .update(patch)
    .eq("user_id", user.id);
  if (error) return internal(error.message);
  return new NextResponse(null, { status: 204 });
}

/** One level of merging — preferences.notifications.kinds replaces
 * cleanly, preferences.density sits at the top level. */
function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    const existing = out[k];
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing)
    ) {
      out[k] = { ...(existing as Record<string, unknown>), ...(v as Record<string, unknown>) };
    } else {
      out[k] = v;
    }
  }
  return out;
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
