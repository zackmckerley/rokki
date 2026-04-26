import type { ImageResponse } from "next/og";
import { renderOgImage, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-image";

/**
 * Default Open Graph card for any page that doesn't override it.
 *
 * Bloomberg-terminal aesthetic — pure black, single Geist wordmark in
 * accent amber, terse tagline, and a faint scanline grid so the card
 * doesn't read as a placeholder. Generated at request time by Next.js
 * via `ImageResponse`; no env vars, no third-party services.
 */
export const runtime = "nodejs";
export const alt = "Rokki — The terminal for your projects";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function Image(): Promise<ImageResponse> {
  return renderOgImage({
    primary: "Rokki",
    secondary: "The terminal for your projects.",
  });
}
