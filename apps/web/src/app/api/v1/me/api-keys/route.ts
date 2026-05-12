import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { encryptToken, cryptoEnabled } from "@/lib/token-crypto";

import { withObservability } from "@/lib/observability";
/**
 * GET  /api/v1/me/api-keys           — my stored provider keys (metadata only)
 * POST /api/v1/me/api-keys  { provider, secret, key_hint? }
 *
 * Secrets are encrypted at rest with TOKEN_ENCRYPTION_KEY (AES-256-GCM).
 * We store only `key_hint` for display (usually the last 4 chars) — the
 * plaintext is never returned after insert.
 *
 * Providers: anthropic | openai | google | mistral | cohere.
 */
const PROVIDERS = ["anthropic", "openai", "google", "mistral", "cohere"];

async function handleGet() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  const { data } = await supabase
    .from("api_keys")
    .select("id, provider, key_hint, last_used_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ data: data ?? [] });
}

async function handlePost(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauth();

  if (!cryptoEnabled()) {
    return NextResponse.json(
      {
        errors: [
          {
            code: "config_error",
            message:
              "Server isn't configured to hold secrets (TOKEN_ENCRYPTION_KEY missing).",
          },
        ],
      },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    provider?: string;
    secret?: string;
    key_hint?: string;
  };

  if (!body.provider || !PROVIDERS.includes(body.provider))
    return bad(`provider must be one of ${PROVIDERS.join(", ")}`);
  if (!body.secret || body.secret.length < 8)
    return bad("secret is required (≥ 8 chars)");

  const secret = body.secret.trim();
  const hint = body.key_hint?.trim() || `…${secret.slice(-4)}`;
  const enc = encryptToken(secret);

  // Upsert on (user_id, provider) so re-adding overwrites.
  const { data: existing } = await supabase
    .from("api_keys")
    .select("id")
    .eq("user_id", user.id)
    .eq("provider", body.provider)
    .maybeSingle();

  const row = {
    user_id: user.id,
    provider: body.provider,
    wrapped_dek: Buffer.from([0x01]), // master-key v1; enveloped scheme later
    ciphertext: Buffer.from(enc.ciphertext, "base64"),
    iv: Buffer.from(enc.iv, "base64"),
    tag: Buffer.from(enc.tag, "base64"),
    key_hint: hint.slice(0, 60),
  };

  let error;
  if (existing) {
    const res = await supabase
      .from("api_keys")
      // @ts-expect-error Phase 0 generics
      .update(row)
      .eq("id", (existing as { id: string }).id);
    error = res.error;
  } else {
    const res = await supabase
      .from("api_keys")
      // @ts-expect-error Phase 0 generics
      .insert(row);
    error = res.error;
  }

  if (error) return internal(error.message);
  return NextResponse.json(
    { data: { provider: body.provider, key_hint: row.key_hint } },
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

export const GET = withObservability(
  handleGet,
  "GET /api/v1/me/api-keys",
);
export const POST = withObservability(
  handlePost,
  "POST /api/v1/me/api-keys",
);
