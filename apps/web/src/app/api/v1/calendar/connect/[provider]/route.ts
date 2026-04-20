import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import {
  authorizeUrl,
  providerConfig,
  type Provider,
} from "@/lib/calendar-oauth";

interface Props {
  params: Promise<{ provider: string }>;
}

/**
 * GET /api/v1/calendar/connect/:provider
 *
 * Kicks off the OAuth dance. Stashes a signed random state in a cookie
 * and redirects to the provider. The callback route verifies the state
 * and completes the exchange.
 */
export async function GET(_req: NextRequest, { params }: Props) {
  const { provider: raw } = await params;
  if (raw !== "google" && raw !== "microsoft") {
    return NextResponse.json(
      { errors: [{ code: "not_found", message: "Unknown provider" }] },
      { status: 404 },
    );
  }
  const provider = raw as Provider;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    );
  }

  const config = providerConfig(provider);
  if (!config) {
    return unavailable(provider);
  }

  const state = crypto.randomBytes(18).toString("base64url");
  const jar = await cookies();
  jar.set(`rokki_cal_state_${provider}`, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(authorizeUrl(provider, config, state));
}

function unavailable(provider: Provider) {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL("/settings/calendars", appUrl);
  url.searchParams.set("error", "provider_not_configured");
  url.searchParams.set("provider", provider);
  return NextResponse.redirect(url);
}
