/**
 * OAuth provider shapes + helpers. Each provider has:
 *   - env-var gate (so unset config fails cleanly at the UI layer)
 *   - authorize URL
 *   - token exchange
 *   - scopes
 *
 * Token storage, event sync, and refresh are handled by the indexer
 * worker. These helpers are only for the Next.js OAuth dance.
 */

export type Provider = "google" | "microsoft";

export interface ProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  authorizeUrl: string;
  tokenUrl: string;
  profileUrl: string;
}

export function providerConfig(p: Provider): ProviderConfig | null {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  if (p === "google") {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      redirectUri: `${appUrl}/api/v1/calendar/callback/google`,
      scopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events.readonly",
      ],
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      profileUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    };
  }
  const clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  const tenant = process.env.MICROSOFT_OAUTH_TENANT ?? "common";
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `${appUrl}/api/v1/calendar/callback/microsoft`,
    scopes: [
      "openid",
      "email",
      "profile",
      "offline_access",
      "https://graph.microsoft.com/Calendars.Read",
    ],
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    profileUrl: "https://graph.microsoft.com/v1.0/me",
  };
}

/** Build the auth URL with a random state. Caller stores the state in a
 * short-lived cookie and verifies on callback.
 *
 * `prompt=select_account consent` — when a user is already signed into
 * a Microsoft/Google account in their browser, the IDP would otherwise
 * silently use that one. Forcing the account picker is critical for
 * the reconnect flow (users replacing a stale connection) and for the
 * second-account flow (e.g. work + personal Outlook). `consent` is
 * still requested so refresh_token is returned even if the user
 * previously consented and was about to skip the screen. */
export function authorizeUrl(
  p: Provider,
  config: ProviderConfig,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    access_type: p === "google" ? "offline" : "",
    prompt: "select_account consent",
    state,
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
}

export async function exchangeCode(
  config: ProviderConfig,
  code: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(
      `token exchange failed (${res.status}): ${(await res.text()).slice(0, 300)}`,
    );
  }
  return (await res.json()) as TokenResponse;
}

export async function fetchProfileEmail(
  config: ProviderConfig,
  accessToken: string,
): Promise<string> {
  const res = await fetch(config.profileUrl, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(
      `profile fetch failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
  const body = (await res.json()) as {
    email?: string;
    mail?: string;
    userPrincipalName?: string;
  };
  return body.email ?? body.mail ?? body.userPrincipalName ?? "unknown";
}

/**
 * Pull the user's email from an OIDC id_token.
 *
 * Both Google and Microsoft return id_tokens alongside access tokens
 * when `openid email profile` are in the requested scopes (which we
 * always request). The id_token is a JWT — we don't need to verify the
 * signature here because we just received it directly from the token
 * endpoint over TLS, so the issuer chain is implicit. We only ever use
 * the email claim for display, not for authorization.
 *
 * Microsoft puts the email in different claims depending on the
 * account type: work/school accounts use `preferred_username` (which is
 * the UPN, almost always an email), personal MSA accounts use `email`.
 * Google uses `email`.
 */
export function emailFromIdToken(idToken: string): string | null {
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as {
      email?: string;
      preferred_username?: string;
      upn?: string;
    };
    const candidate =
      payload.email ?? payload.preferred_username ?? payload.upn ?? null;
    // Sanity-check: only return strings that look like emails. UPNs in
    // some tenants aren't email-shaped (rare, but cheap to guard).
    if (candidate && /.+@.+\..+/.test(candidate)) return candidate;
    return null;
  } catch {
    return null;
  }
}
