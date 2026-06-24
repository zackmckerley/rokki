"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Tv,
  Volume2,
  VolumeX,
  RotateCw,
  ExternalLink,
  Loader2,
} from "lucide-react";

interface TvData {
  configured: boolean;
  videoId: string | null;
  channel: {
    id: string;
    name: string;
    attribution: string;
    youtubeChannelId: string;
  };
  channels: { id: string; name: string }[];
}

/**
 * Markets TV — embeds an official finance-news live stream (Bloomberg TV by
 * default) from YouTube. The server route resolves the current live video id;
 * we embed it via youtube-nocookie.com. Muted by default (browsers require it
 * for autoplay); the user clicks to unmute. Degrades to a "watch on YouTube"
 * link when no key is set or the channel isn't live.
 */
export function MarketsTV() {
  const [channelId, setChannelId] = useState("bloomberg");
  const [data, setData] = useState<TvData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/v1/markets/tv?channel=${encodeURIComponent(channelId)}`,
        { credentials: "include" },
      );
      const b = (await r.json().catch(() => ({}))) as {
        data?: TvData;
        errors?: { message: string }[];
      };
      if (!r.ok || !b.data) {
        setError(b.errors?.[0]?.message ?? "Couldn’t load the stream.");
        return;
      }
      setData(b.data);
    } catch {
      setError("Couldn’t load the stream.");
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    void load();
  }, [load]);

  const channel = data?.channel;
  const youtubeLiveUrl = channel
    ? `https://www.youtube.com/channel/${channel.youtubeChannelId}/live`
    : "https://www.youtube.com/results?search_query=bloomberg+tv+live";
  const embedSrc = data?.videoId
    ? `https://www.youtube-nocookie.com/embed/${data.videoId}?autoplay=1&mute=${
        muted ? 1 : 0
      }&playsinline=1&modestbranding=1&rel=0`
    : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tv className="h-4 w-4 text-text-2" aria-hidden="true" />
        <h1 className="text-sm font-semibold text-text-0">
          {channel?.name ?? "TV"}
        </h1>
        <span className="rounded-sm border border-border px-1.5 py-px text-[10px] uppercase tracking-wide text-text-3">
          Live
        </span>
        {data && data.channels.length > 1 ? (
          <select
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            aria-label="Channel"
            className="rounded border border-border bg-bg-2 px-2 py-1 text-xs text-text-1"
          >
            {data.channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          {embedSrc ? (
            <button
              type="button"
              onClick={() => setMuted((m) => !m)}
              className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs text-text-2 hover:text-text-0"
            >
              {muted ? (
                <VolumeX className="h-3.5 w-3.5" />
              ) : (
                <Volume2 className="h-3.5 w-3.5" />
              )}
              {muted ? "Unmute" : "Mute"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh stream"
            title="Refresh"
            className="rounded-sm border border-border p-1 text-text-2 hover:text-text-0"
          >
            <RotateCw className="h-3.5 w-3.5" />
          </button>
          <a
            href={youtubeLiveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 rounded-sm border border-border px-2 py-1 text-xs text-text-2 hover:text-text-0"
          >
            <ExternalLink className="h-3.5 w-3.5" /> YouTube
          </a>
        </div>
      </div>

      <div
        className="relative w-full overflow-hidden rounded-md border border-border bg-black"
        style={{ aspectRatio: "16 / 9" }}
      >
        {loading ? (
          <div className="absolute inset-0 flex items-center justify-center text-text-3">
            <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" />
          </div>
        ) : embedSrc ? (
          <iframe
            // Remount on videoId/mute change so a fresh broadcast (or unmute)
            // reloads the player.
            key={`${data?.videoId}-${muted}`}
            src={embedSrc}
            title={`${channel?.name ?? "Markets"} live`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center">
            <Tv className="h-6 w-6 text-text-3" aria-hidden="true" />
            <p className="max-w-sm text-sm text-text-1">
              {error
                ? error
                : data && !data.configured
                  ? "Add a free YouTube API key (YOUTUBE_API_KEY) to embed the live stream here."
                  : `${channel?.name ?? "This channel"} isn’t live right now.`}
            </p>
            <a
              href={youtubeLiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-sm bg-accent px-3 py-1.5 text-xs text-bg-0"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Watch on YouTube
            </a>
          </div>
        )}
      </div>

      {channel ? (
        <p className="text-[10px] leading-snug text-text-3">
          {channel.attribution}. Embedded via YouTube — Rokki does not host or
          rebroadcast the feed.
        </p>
      ) : null}
    </div>
  );
}
