import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { withObservability } from "@/lib/observability";
import { ok, unauthorized, badRequest, mapMarketError } from "@/lib/markets/api";
import {
  TV_CHANNELS,
  findChannel,
  tvAvailable,
  resolveLiveVideoId,
} from "@/lib/markets/tv";

// Reads the YouTube key + resolves a fresh live id at request time.
export const dynamic = "force-dynamic";

/**
 * GET /api/v1/markets/tv?channel=bloomberg
 *
 * Auth-gated (only signed-in users trigger the quota-costing resolver). Returns
 * the channel's current live YouTube video id (null when not live), the channel
 * list, and whether YOUTUBE_API_KEY is configured. The key never leaves the
 * server — the client embeds youtube-nocookie.com/<videoId> directly.
 */
async function handleGet(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const requested =
    new URL(request.url).searchParams.get("channel") ?? TV_CHANNELS[0].id;
  const channel = findChannel(requested);
  if (!channel) return badRequest("Unknown channel");

  const channels = TV_CHANNELS.map((c) => ({ id: c.id, name: c.name }));
  const meta = {
    id: channel.id,
    name: channel.name,
    attribution: channel.attribution,
    handle: channel.handle,
  };

  if (!tvAvailable()) {
    return ok({ configured: false, videoId: null, channel: meta, channels });
  }

  try {
    const videoId = await resolveLiveVideoId(channel);
    return ok({ configured: true, videoId, channel: meta, channels });
  } catch (e) {
    return mapMarketError(e);
  }
}

export const GET = withObservability(handleGet, "GET /api/v1/markets/tv");
