/**
 * Markets TV — resolves the current live broadcast for a finance-news channel
 * on YouTube so it can be embedded inline. Server-only: it carries the YouTube
 * Data API key and must never run in the browser.
 *
 * We target channels by their @handle (not a raw channel id) and resolve the
 * id at request time, so we always hit the right channel — e.g. Bloomberg
 * Television is youtube.com/@markets, which is distinct from Bloomberg News
 * (@Bloomberg-News) and Bloomberg Originals (@business). Then we ask the Data
 * API "what is this channel live with right now?" (each broadcast gets a fresh
 * video id). Both lookups are cached since the live search costs 100 quota
 * units. The client embeds the returned id via youtube-nocookie.com — no key
 * needed on the client.
 *
 * Embeds the OFFICIAL public live stream only; we never proxy or re-host the
 * feed (that would cross into ToS/copyright).
 */
import "server-only";
import { fetchJson, hasKey, requireKey } from "./http";

const KEY_ENV = "YOUTUBE_API_KEY";

export interface TvChannel {
  /** Our stable slug (used in the API query + UI). */
  id: string;
  name: string;
  /** The channel's YouTube @handle, without the leading @. */
  handle: string;
  attribution: string;
}

/** Curated free, official finance-news live channels. Bloomberg first. Add
 *  more here by @handle — the UI picks them up. */
export const TV_CHANNELS: TvChannel[] = [
  {
    id: "bloomberg",
    name: "Bloomberg Television",
    // youtube.com/@markets IS Bloomberg Television (the markets TV simulcast) —
    // NOT Bloomberg News (@Bloomberg-News) or Bloomberg Originals (@business).
    handle: "markets",
    attribution:
      "Bloomberg Television (@markets) — official live stream on YouTube",
  },
];

export function tvAvailable(): boolean {
  return hasKey(KEY_ENV);
}

export function findChannel(id: string): TvChannel | undefined {
  return TV_CHANNELS.find((c) => c.id === id);
}

interface YtChannelsResponse {
  items?: { id?: string }[];
}
interface YtSearchResponse {
  items?: { id?: { videoId?: string } }[];
}

const VIDEO_ID_RE = /^[\w-]{11}$/;

// @handle → channel id rarely changes, so cache it long. Costs 1 quota unit.
const channelIdCache = new Map<string, { id: string | null; at: number }>();
const CHANNEL_TTL_MS = 12 * 60 * 60_000;

async function resolveChannelId(handle: string): Promise<string | null> {
  const key = requireKey(KEY_ENV, "YouTube");
  const hit = channelIdCache.get(handle);
  if (hit && Date.now() - hit.at < CHANNEL_TTL_MS) return hit.id;
  const url =
    `https://www.googleapis.com/youtube/v3/channels?part=id` +
    `&forHandle=${encodeURIComponent(handle)}&key=${encodeURIComponent(key)}`;
  const data = await fetchJson<YtChannelsResponse>(url, {
    provider: "YouTube",
    timeoutMs: 8_000,
  });
  const id = data.items?.[0]?.id ?? null;
  channelIdCache.set(handle, { id, at: Date.now() });
  return id;
}

// The live video id is stable across a broadcast and the search call is
// quota-expensive (100 units), so cache per channel.
const liveCache = new Map<string, { videoId: string | null; at: number }>();
const LIVE_TTL_MS = 5 * 60_000;

/**
 * The channel's current live video id, or null when it isn't live. Resolves the
 * channel by its @handle first (so we always target the right channel), then
 * finds its live broadcast. Both lookups cached. Throws MarketDataError(503)
 * when YOUTUBE_API_KEY is missing.
 */
export async function resolveLiveVideoId(
  channel: TvChannel,
): Promise<string | null> {
  requireKey(KEY_ENV, "YouTube");
  const channelId = await resolveChannelId(channel.handle);
  if (!channelId) return null;

  const hit = liveCache.get(channelId);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.videoId;

  const key = requireKey(KEY_ENV, "YouTube");
  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet` +
    `&channelId=${encodeURIComponent(channelId)}` +
    `&eventType=live&type=video&maxResults=1&key=${encodeURIComponent(key)}`;
  const data = await fetchJson<YtSearchResponse>(url, {
    provider: "YouTube",
    timeoutMs: 8_000,
  });
  const raw = data.items?.[0]?.id?.videoId ?? null;
  // Only accept a well-formed YouTube id so nothing unexpected reaches the
  // iframe src downstream.
  const videoId = raw && VIDEO_ID_RE.test(raw) ? raw : null;
  liveCache.set(channelId, { videoId, at: Date.now() });
  return videoId;
}
