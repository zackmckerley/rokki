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
  const segment = params.ticker;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let displayName = segment;
  let urlSegment = segment;
  if (url && serviceKey) {
    try {
      const admin = createAdminClient<Database>(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      // Slug-or-ticker fallback — duplicates the lookup logic from
      // `resolveTerminalBySegment` (we can't import that here because
      // this file uses the admin client, not the SSR-cookie client).
      const { data: bySlug } = await admin
        .from("terminals")
        .select("name, slug")
        // @ts-expect-error generated types haven't been regenerated
        // since the 20260526010000_terminal_slug migration added the
        // column.
        .eq("slug", segment)
        .is("archived_at", null)
        .maybeSingle();
      let row = bySlug as { name: string; slug: string } | null;
      if (!row && /^[A-Z][A-Z0-9]{1,9}$/.test(segment.toUpperCase())) {
        const { data: byTicker } = await admin
          .from("terminals")
          .select("name, slug")
          .eq("ticker", segment.toUpperCase())
          .is("archived_at", null)
          .maybeSingle();
        row = byTicker as { name: string; slug: string } | null;
      }
      if (row?.name) displayName = row.name;
      if (row?.slug) urlSegment = row.slug;
    } catch {
      // fall through with the URL segment as the name
    }
  }

  return renderOgImage({
    primary: displayName,
    secondary: "Rokki terminal",
    topLine: `rokki.ai · /p/${urlSegment}`,
    bottomLabel: "Tasks · Files · MCP · Real-time",
  });
}
