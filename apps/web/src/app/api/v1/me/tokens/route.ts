import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateToken } from "@/lib/tokens";
import type { TokenScope } from "@rokki/db";

/**
 * GET  /api/v1/me/tokens          — list my active tokens (prefix only; plaintext never stored)
 * POST /api/v1/me/tokens { name, scopes?, expires_in_days? }
 *                                 — create a new token; plaintext returned ONCE
 *
 * See docs/04_AUTH_SECURITY.md §4.2.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data } = await supabase
    .from("access_tokens")
    .select(
      "id, name, token_prefix, scopes, project_restrictions, created_at, last_used_at, expires_at, revoked_at",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const body = (await request.json().catch(() => ({}))) as {
    name?: string;
    scopes?: TokenScope[];
    expires_in_days?: number;
  };

  if (!body.name?.trim() || body.name.length > 120)
    return bad("name is required (1–120 chars)");

  const scopes: TokenScope[] =
    Array.isArray(body.scopes) && body.scopes.length > 0
      ? body.scopes.filter((s): s is TokenScope =>
          ["read", "write"].includes(s),
        )
      : ["read"];

  const expires_at =
    typeof body.expires_in_days === "number" && body.expires_in_days > 0
      ? new Date(
          Date.now() + body.expires_in_days * 86400_000,
        ).toISOString()
      : null;

  const { plaintext, prefix, hash } = generateToken();

  const { data, error } = await supabase
    .from("access_tokens")
    // @ts-expect-error Phase 0 — insert type collapses to never
    .insert({
      user_id: user.id,
      name: body.name.trim(),
      token_hash: hash,
      token_prefix: prefix,
      scopes,
      expires_at,
    })
    .select("id, name, token_prefix, scopes, created_at, expires_at")
    .single();

  if (error || !data) {
    return internal(error?.message ?? "insert failed");
  }

  return NextResponse.json(
    {
      data: {
        ...(data as object),
        // One-time disclosure; never stored, never returned again.
        token: plaintext,
      },
    },
    { status: 201 },
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
function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}
