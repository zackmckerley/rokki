import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  exchangeCode,
  fetchProfileEmail,
  providerConfig,
  type Provider,
} from "@/lib/calendar-oauth";
import { encryptToken } from "@/lib/token-crypto";
import type { Database } from "@rokki/db";

interface Props {
  params: Promise<{ provider: string }>;
}

/**
 * GET /api/v1/calendar/callback/:provider
 *
 * Completes the OAuth flow: verify state, exchange code, fetch the user's
 * email for display, and persist the encrypted tokens as a new
 * calendar_connection. Redirects back to /settings/calendars with a
 * status flag so the UI can render success or error inline.
 */
export async function GET(request: NextRequest, { params }: Props) {
  const { provider: raw } = await params;
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const settings = (flag: string, value = "1") => {
    const url = new URL("/settings/calendars", appUrl);
    url.searchParams.set(flag, value);
    return NextResponse.redirect(url);
  };

  if (raw !== "google" && raw !== "microsoft")
    return settings("error", "unknown_provider");
  const provider = raw as Provider;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", appUrl));
  }

  const config = providerConfig(provider);
  if (!config) return settings("error", "provider_not_configured");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  if (providerError)
    return settings("error", providerError);
  if (!code || !state)
    return settings("error", "missing_code");

  const jar = await cookies();
  const expectedState = jar.get(`rokki_cal_state_${provider}`)?.value;
  jar.delete(`rokki_cal_state_${provider}`);
  if (!expectedState || expectedState !== state)
    return settings("error", "bad_state");

  let tokens;
  try {
    tokens = await exchangeCode(config, code);
  } catch (e) {
    console.error("[calendar] exchange failed:", e);
    return settings("error", "token_exchange_failed");
  }

  let email: string;
  try {
    email = await fetchProfileEmail(config, tokens.access_token);
  } catch (e) {
    console.error("[calendar] profile fetch failed:", e);
    email = "(unknown)";
  }

  const accessEnc = encryptToken(tokens.access_token);
  const refreshEnc = tokens.refresh_token
    ? encryptToken(tokens.refresh_token)
    : null;
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : null;

  // Use the service-role client for the insert so the encrypted token
  // columns (not exposed to the authenticated role) go through cleanly.
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await admin
    .from("calendar_connections")
    .upsert(
      {
        user_id: user.id,
        provider,
        account_email: email,
        access_token_ciphertext: accessEnc.ciphertext,
        access_token_iv: accessEnc.iv,
        access_token_tag: accessEnc.tag,
        access_token_expires_at: expiresAt,
        refresh_token_ciphertext: refreshEnc?.ciphertext ?? null,
        refresh_token_iv: refreshEnc?.iv ?? null,
        refresh_token_tag: refreshEnc?.tag ?? null,
        scopes: config.scopes,
        revoked_at: null,
      },
      { onConflict: "user_id,provider,account_email" },
    );
  if (error) {
    console.error("[calendar] upsert connection failed:", error);
    return settings("error", "save_failed");
  }

  return settings("connected", provider);
}
