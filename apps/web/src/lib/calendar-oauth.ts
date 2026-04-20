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
 * short-lived cookie and verifies on callback. */
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
    prompt: "consent",
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
