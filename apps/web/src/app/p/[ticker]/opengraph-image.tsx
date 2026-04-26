import type { ImageResponse } from "next/og";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

/**
 * Per-terminal Open Graph card.
 *
 * The image scraper (Slackbot, Twitter, iMessage preview, etc.) has no
 * session cookie, so we can't use the user-bound supabase client here —
 * RLS would return nothing. We use the service-role client read-only to
 * fetch the terminal `name` for the ticker that's already in the URL.
 *
 * The ticker itself is public information once shared (it's in the URL),
 * so enriching the card with the terminal's display name is consistent
 * with how every share-link preview works.
 */
export const runtime = "nodejs";
export const alt = "Rokki terminal";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

interface Props {
  params: { ticker: string };
}

export default async function Image({ params }: Props): Promise<ImageResponse> {
  const tickerUpper = params.ticker.toUpperCase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let displayName = tickerUpper;
  if (url && serviceKey) {
    try {
      const admin = createAdminClient<Database>(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data } = await admin
        .from("terminals")
        .select("name")
        .eq("ticker", tickerUpper)
        .is("archived_at", null)
        .maybeSingle();
      const row = data as { name: string } | null;
      if (row?.name) displayName = row.name;
    } catch {
      // fall through with the ticker as the name
    }
  }

  return renderOgImage({
    primary: tickerUpper,
    secondary: displayName === tickerUpper ? "Rokki terminal" : displayName,
    topLine: `rokki.ai · /p/${tickerUpper.toLowerCase()}`,
    bottomLabel: "Tasks · Files · MCP · Real-time",
  });
}
