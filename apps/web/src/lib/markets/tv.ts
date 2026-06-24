/**
 * Markets TV — resolves the current live broadcast for a finance-news channel
 * on YouTube so it can be embedded inline. Server-only: it carries the YouTube
 * Data API key and must never run in the browser.
 *
 * Why a resolver: YouTube assigns a fresh video id to each live broadcast, so
 * we ask the Data API "what is this channel live with right now?" (cached, since
 * that search call costs 100 quota units). The client then embeds the returned
 * video id via youtube-nocookie.com — no key needed on the client.
 *
 * Embeds the OFFICIAL public live streams only. We never proxy or re-host the
 * feed (that would cross into ToS/copyright); the iframe points straight at
 * YouTube.
 */
import "server-only";
import { fetchJson, hasKey, requireKey } from "./http";

const KEY_ENV = "YOUTUBE_API_KEY";

export interface TvChannel {
  /** Our stable slug (used in the API query + UI). */
  id: string;
  name: string;
  /** The channel's YouTube channel id (UC…). */
  youtubeChannelId: string;
  attribution: string;
}

/** Curated free, official finance-news live channels. Bloomberg first. Add
 *  more here once their channel id is verified — the UI picks them up. */
export const TV_CHANNELS: TvChannel[] = [
  {
    id: "bloomberg",
    name: "Bloomberg TV",
    youtubeChannelId: "UCIALMKvObZNtJ6AmdCLP7Lg",
    attribution: "Bloomberg Television — official live stream on YouTube",
  },
];

export function tvAvailable(): boolean {
  return hasKey(KEY_ENV);
}

export function findChannel(id: string): TvChannel | undefined {
  return TV_CHANNELS.find((c) => c.id === id);
}

interface YtSearchResponse {
  items?: { id?: { videoId?: string } }[];
}

// The live video id is stable across a broadcast and the search call is
// quota-expensive (100 units), so cache per channel. In-process + short TTL is
// plenty: worst case a warm instance refetches every few minutes.
const cache = new Map<string, { videoId: string | null; at: number }>();
const TTL_MS = 5 * 60_000;

/**
 * The channel's current live video id, or null when it isn't live. Cached.
 * Throws MarketDataError(503) when YOUTUBE_API_KEY is missing.
 */
export async function resolveLiveVideoId(
  youtubeChannelId: string,
): Promise<string | null> {
  const key = requireKey(KEY_ENV, "YouTube");
  const hit = cache.get(youtubeChannelId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.videoId;

  const url =
    `https://www.googleapis.com/youtube/v3/search?part=snippet` +
    `&channelId=${encodeURIComponent(youtubeChannelId)}` +
    `&eventType=live&type=video&maxResults=1&key=${encodeURIComponent(key)}`;
  const data = await fetchJson<YtSearchResponse>(url, {
    provider: "YouTube",
    timeoutMs: 8_000,
  });
  const raw = data.items?.[0]?.id?.videoId ?? null;
  // Only accept a well-formed YouTube id so nothing unexpected can be
  // interpolated into the iframe src downstream.
  const videoId = raw && /^[\w-]{11}$/.test(raw) ? raw : null;
  cache.set(youtubeChannelId, { videoId, at: Date.now() });
  return videoId;
}
