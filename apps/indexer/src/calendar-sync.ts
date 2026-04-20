import { createClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import {
  decryptToken,
  encryptToken,
  cryptoEnabled,
  type Encrypted,
} from "./calendar-crypto.js";

/**
 * Calendar sync worker.
 *
 * Runs every CALENDAR_POLL_MS (default 60s) — on each tick:
 *   1. pick the N connections with the oldest last_sync_at
 *   2. refresh the access token if expired
 *   3. fetch events between (today, today+14d)
 *   4. upsert rows into calendar_events (keyed by connection_id + external_id)
 *   5. soft-delete rows we didn't see (the provider dropped them)
 *   6. record last_sync_at + any error message
 *
 * Fails soft: one bad connection doesn't stop the rest.
 */

const POLL_MS = Number(process.env.CALENDAR_POLL_MS ?? 60_000);
const BATCH = Number(process.env.CALENDAR_SYNC_BATCH ?? 4);

const admin = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

interface Connection {
  id: string;
  user_id: string;
  provider: "google" | "microsoft";
  account_email: string;
  access_token_ciphertext: string;
  access_token_iv: string;
  access_token_tag: string;
  access_token_expires_at: string | null;
  refresh_token_ciphertext: string | null;
  refresh_token_iv: string | null;
  refresh_token_tag: string | null;
}

interface NormalizedEvent {
  external_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  source_calendar: string | null;
  html_link: string | null;
  raw: unknown;
}

export function calendarSyncEnabled(): boolean {
  if (!cryptoEnabled()) return false;
  const google =
    process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const microsoft =
    process.env.MICROSOFT_OAUTH_CLIENT_ID &&
    process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  return !!(google || microsoft);
}

export async function runCalendarSyncTick(): Promise<number> {
  if (!calendarSyncEnabled()) return 0;
  const { data } = await admin
    .from("calendar_connections")
    .select(
      "id, user_id, provider, account_email, access_token_ciphertext, access_token_iv, access_token_tag, access_token_expires_at, refresh_token_ciphertext, refresh_token_iv, refresh_token_tag",
    )
    .is("revoked_at", null)
    .order("last_sync_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  const conns = (data ?? []) as Connection[];
  if (conns.length === 0) return 0;

  await Promise.all(conns.map((c) => syncConnection(c).catch((e) => {
    console.error(`[calendar] ${c.provider} sync failed for ${c.account_email}:`, e);
  })));
  return conns.length;
}

async function syncConnection(c: Connection): Promise<void> {
  try {
    const accessToken = await ensureAccessToken(c);
    const events = await fetchEvents(c, accessToken);
    await upsertEvents(c.id, events);
    await admin
      .from("calendar_connections")
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
      })
      .eq("id", c.id);
    console.log(
      `[calendar] ${c.provider} ${c.account_email}: synced ${events.length} event(s)`,
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("calendar_connections")
      .update({ last_sync_error: msg.slice(0, 500) })
      .eq("id", c.id);
    throw e;
  }
}

async function ensureAccessToken(c: Connection): Promise<string> {
  const expires = c.access_token_expires_at
    ? new Date(c.access_token_expires_at).getTime()
    : 0;
  // If we still have >2 min of lifetime, reuse the token.
  if (expires - Date.now() > 2 * 60 * 1000) {
    return decryptToken({
      ciphertext: c.access_token_ciphertext,
      iv: c.access_token_iv,
      tag: c.access_token_tag,
    });
  }
  if (!c.refresh_token_ciphertext || !c.refresh_token_iv || !c.refresh_token_tag) {
    throw new Error("access token expired and no refresh token stored");
  }
  const refresh = decryptToken({
    ciphertext: c.refresh_token_ciphertext,
    iv: c.refresh_token_iv,
    tag: c.refresh_token_tag,
  });

  const tokenUrl =
    c.provider === "google"
      ? "https://oauth2.googleapis.com/token"
      : `https://login.microsoftonline.com/${
          process.env.MICROSOFT_OAUTH_TENANT ?? "common"
        }/oauth2/v2.0/token`;
  const clientId =
    c.provider === "google"
      ? process.env.GOOGLE_OAUTH_CLIENT_ID!
      : process.env.MICROSOFT_OAUTH_CLIENT_ID!;
  const clientSecret =
    c.provider === "google"
      ? process.env.GOOGLE_OAUTH_CLIENT_SECRET!
      : process.env.MICROSOFT_OAUTH_CLIENT_SECRET!;

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `refresh failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
  const body = (await res.json()) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
  };
  const newExpires = body.expires_in
    ? new Date(Date.now() + body.expires_in * 1000).toISOString()
    : null;
  const newAccess: Encrypted = encryptToken(body.access_token);
  const newRefresh: Encrypted | null = body.refresh_token
    ? encryptToken(body.refresh_token)
    : null;
  await admin
    .from("calendar_connections")
    .update({
      access_token_ciphertext: newAccess.ciphertext,
      access_token_iv: newAccess.iv,
      access_token_tag: newAccess.tag,
      access_token_expires_at: newExpires,
      ...(newRefresh
        ? {
            refresh_token_ciphertext: newRefresh.ciphertext,
            refresh_token_iv: newRefresh.iv,
            refresh_token_tag: newRefresh.tag,
          }
        : {}),
    })
    .eq("id", c.id);
  return body.access_token;
}

async function fetchEvents(
  c: Connection,
  accessToken: string,
): Promise<NormalizedEvent[]> {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 14);

  if (c.provider === "google") {
    const url = new URL(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    url.searchParams.set("timeMin", from.toISOString());
    url.searchParams.set("timeMax", to.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "100");
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(
        `google events fetch ${res.status}: ${(await res.text()).slice(0, 200)}`,
      );
    }
    type Item = {
      id: string;
      summary?: string;
      description?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
      htmlLink?: string;
    };
    const body = (await res.json()) as { items?: Item[] };
    return (body.items ?? []).map((it) => ({
      external_id: it.id,
      title: it.summary ?? "(untitled)",
      description: it.description ?? null,
      location: it.location ?? null,
      starts_at: it.start?.dateTime ?? it.start?.date ?? from.toISOString(),
      ends_at: it.end?.dateTime ?? it.end?.date ?? null,
      all_day: !!it.start?.date && !it.start?.dateTime,
      source_calendar: "primary",
      html_link: it.htmlLink ?? null,
      raw: it,
    }));
  }

  // Microsoft Graph
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", from.toISOString());
  url.searchParams.set("endDateTime", to.toISOString());
  url.searchParams.set("$top", "100");
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(
      `microsoft events fetch ${res.status}: ${(await res.text()).slice(0, 200)}`,
    );
  }
  type GraphItem = {
    id: string;
    subject?: string;
    bodyPreview?: string;
    location?: { displayName?: string };
    start?: { dateTime?: string };
    end?: { dateTime?: string };
    isAllDay?: boolean;
    webLink?: string;
  };
  const body = (await res.json()) as { value?: GraphItem[] };
  return (body.value ?? []).map((it) => ({
    external_id: it.id,
    title: it.subject ?? "(untitled)",
    description: it.bodyPreview ?? null,
    location: it.location?.displayName ?? null,
    starts_at: it.start?.dateTime ?? from.toISOString(),
    ends_at: it.end?.dateTime ?? null,
    all_day: !!it.isAllDay,
    source_calendar: "primary",
    html_link: it.webLink ?? null,
    raw: it,
  }));
}

async function upsertEvents(
  connectionId: string,
  events: NormalizedEvent[],
): Promise<void> {
  if (events.length === 0) return;
  // Bulk upsert.
  const rows = events.map((e) => ({
    connection_id: connectionId,
    external_id: e.external_id,
    title: e.title,
    description: e.description,
    location: e.location,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    all_day: e.all_day,
    source_calendar: e.source_calendar,
    html_link: e.html_link,
    raw: e.raw as Record<string, unknown>,
    fetched_at: new Date().toISOString(),
    deleted_at: null,
  }));
  const { error } = await admin
    .from("calendar_events")
    // @ts-expect-error generic upsert payload collapses to never
    .upsert(rows, { onConflict: "connection_id,external_id" });
  if (error) throw new Error(`upsert: ${error.message}`);

  // Soft-delete events we no longer see (cancelled / moved out of window).
  const ids = events.map((e) => e.external_id);
  const { error: delErr } = await admin
    .from("calendar_events")
    .update({ deleted_at: new Date().toISOString() })
    .eq("connection_id", connectionId)
    .is("deleted_at", null)
    .not("external_id", "in", `(${ids.map((id) => `"${id}"`).join(",") || '""'})`);
  if (delErr) console.warn("[calendar] cleanup delete failed:", delErr.message);
}

export function scheduleCalendarSync(onceMode: boolean): () => void {
  let interval: ReturnType<typeof setInterval> | null = null;
  const tick = () => {
    runCalendarSyncTick().catch((e) =>
      console.error("[calendar] tick failed:", e),
    );
  };
  if (onceMode) {
    tick();
  } else {
    tick();
    interval = setInterval(tick, POLL_MS);
  }
  return () => {
    if (interval) clearInterval(interval);
  };
}
