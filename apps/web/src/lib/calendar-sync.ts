import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { decryptToken, encryptToken, type Encrypted } from "@/lib/token-crypto";

/**
 * In-process calendar sync.
 *
 * This is a port of the standalone indexer worker (apps/indexer/src/
 * calendar-sync.ts) into the Next.js app, so we can drive sync from a
 * Vercel function on a cron schedule (GitHub Actions for now, since
 * Vercel Hobby tier limits cron to daily — see
 * .github/workflows/calendar-sync.yml).
 *
 * Per tick:
 *   1. pick the N connections with the oldest last_sync_at
 *   2. refresh the access token if expired
 *   3. fetch events between (today, today+14d) from Graph / Calendar
 *   4. upsert rows into calendar_events
 *   5. soft-delete events we no longer see
 *   6. record last_sync_at + any error
 *
 * Fails soft: one bad connection doesn't stop the rest.
 */

const BATCH_SIZE = 8;

type AdminClient = ReturnType<typeof createAdminClient<Database>>;

let cached: AdminClient | null = null;
function admin(): AdminClient | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached = createAdminClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

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

export interface TickResult {
  attempted: number;
  succeeded: number;
  failed: number;
  events: number;
}

export async function runCalendarSyncTick(
  batchSize = BATCH_SIZE,
): Promise<TickResult> {
  return runSync({ batchSize });
}

/**
 * Sync only the connections owned by `userId`. Used by the user-facing
 * "Sync now" button on /settings/calendars so a user can verify their
 * connection without waiting for the next 15-min cron tick. Bypasses
 * `last_sync_at` ordering — we want every connection the user owns.
 */
export async function runCalendarSyncForUser(
  userId: string,
): Promise<TickResult> {
  return runSync({ userId });
}

interface SyncOptions {
  userId?: string;
  batchSize?: number;
}

async function runSync(opts: SyncOptions): Promise<TickResult> {
  const result: TickResult = { attempted: 0, succeeded: 0, failed: 0, events: 0 };
  const a = admin();
  if (!a) return result;

  let q = a
    .from("calendar_connections")
    .select(
      "id, user_id, provider, account_email, access_token_ciphertext, access_token_iv, access_token_tag, access_token_expires_at, refresh_token_ciphertext, refresh_token_iv, refresh_token_tag",
    )
    .is("revoked_at", null);
  if (opts.userId) {
    q = q.eq("user_id", opts.userId);
  } else {
    q = q
      .order("last_sync_at", { ascending: true, nullsFirst: true })
      .limit(opts.batchSize ?? BATCH_SIZE);
  }
  const { data, error } = await q;
  if (error) {
    console.error("[calendar-sync] connection lookup failed:", error.message);
    return result;
  }
  const conns = (data ?? []) as Connection[];
  result.attempted = conns.length;
  if (conns.length === 0) return result;

  // Sequential rather than Promise.all — cheap, easier to reason about,
  // and we don't want a stampede of refresh-token requests if many tokens
  // expired at once.
  for (const c of conns) {
    try {
      const events = await syncConnection(a, c);
      result.events += events;
      result.succeeded += 1;
    } catch (e) {
      result.failed += 1;
      console.error(
        `[calendar-sync] ${c.provider}/${c.account_email} failed:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  return result;
}

async function syncConnection(a: AdminClient, c: Connection): Promise<number> {
  try {
    const accessToken = await ensureAccessToken(a, c);
    const events = await fetchEvents(c, accessToken);
    await upsertEvents(a, c.id, events);
    await a
      .from("calendar_connections")
      // eslint-disable-next-line
      .update({
        last_sync_at: new Date().toISOString(),
        last_sync_error: null,
      } as any)
      .eq("id", c.id);
    return events.length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await a
      .from("calendar_connections")
      // eslint-disable-next-line
      .update({ last_sync_error: msg.slice(0, 500) } as any)
      .eq("id", c.id);
    throw e;
  }
}

async function ensureAccessToken(
  a: AdminClient,
  c: Connection,
): Promise<string> {
  const expires = c.access_token_expires_at
    ? new Date(c.access_token_expires_at).getTime()
    : 0;
  // Reuse the stored token if it still has >2 minutes of life.
  if (expires - Date.now() > 2 * 60 * 1000) {
    return decryptToken({
      ciphertext: c.access_token_ciphertext,
      iv: c.access_token_iv,
      tag: c.access_token_tag,
    });
  }
  if (
    !c.refresh_token_ciphertext ||
    !c.refresh_token_iv ||
    !c.refresh_token_tag
  ) {
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
      ? process.env.GOOGLE_OAUTH_CLIENT_ID
      : process.env.MICROSOFT_OAUTH_CLIENT_ID;
  const clientSecret =
    c.provider === "google"
      ? process.env.GOOGLE_OAUTH_CLIENT_SECRET
      : process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(`${c.provider} OAuth client not configured`);
  }

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
  await a
    .from("calendar_connections")
    // eslint-disable-next-line
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
    } as any)
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
  a: AdminClient,
  connectionId: string,
  events: NormalizedEvent[],
): Promise<void> {
  if (events.length === 0) return;
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
  const { error } = await a
    .from("calendar_events")
    // eslint-disable-next-line
    .upsert(rows as any, { onConflict: "connection_id,external_id" });
  if (error) throw new Error(`upsert: ${error.message}`);

  // Soft-delete events we no longer see in the window (cancelled, moved
  // out, deleted in the source).
  //
  // Earlier revisions used PostgREST's `.not("external_id", "in", "(…)")`
  // filter built from a comma-joined string, which required escaping
  // every quote/backslash in the external_id (CodeQL flagged it as a
  // string-escape sink). The two-step approach below is safer: query the
  // current live IDs for this connection, diff them in JS against the
  // events we just upserted, and soft-delete by primary key. Both reads
  // and writes use parameterised filters, no manual string interpolation.
  const { data: live, error: liveErr } = await a
    .from("calendar_events")
    .select("id, external_id")
    .eq("connection_id", connectionId)
    .is("deleted_at", null);
  if (liveErr) {
    console.warn("[calendar-sync] cleanup lookup failed:", liveErr.message);
    return;
  }
  const seen = new Set(events.map((e) => e.external_id));
  const stale = (live ?? [])
    .filter((r): r is { id: string; external_id: string } =>
      typeof r === "object" &&
      r !== null &&
      "external_id" in r &&
      typeof (r as { external_id?: unknown }).external_id === "string",
    )
    .filter((r) => !seen.has(r.external_id))
    .map((r) => r.id);
  if (stale.length === 0) return;
  const { error: delErr } = await a
    .from("calendar_events")
    // eslint-disable-next-line
    .update({ deleted_at: new Date().toISOString() } as any)
    .in("id", stale);
  if (delErr)
    console.warn("[calendar-sync] cleanup delete failed:", delErr.message);
}
