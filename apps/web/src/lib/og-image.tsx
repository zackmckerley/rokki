import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Shared renderer for OG / Twitter cards. The root and per-terminal
 * cards both call into here so the visual identity stays in one place.
 *
 * Pure Next.js — no env vars, no third-party services. Fonts are loaded
 * from `node_modules/geist`; if the font file isn't on disk (some build
 * environments hoist differently) we fall back to the runtime's default
 * sans without crashing.
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const ACCENT = "#f5a623";
const BG_0 = "#0a0a0b";
const BG_2 = "#1a1a1d";
const TEXT_0 = "#f5f5f7";
const TEXT_2 = "#8a8a92";
const TEXT_3 = "#5a5a62";

async function loadGeist(weight: "regular" | "bold"): Promise<ArrayBuffer | null> {
  const file = weight === "bold" ? "Geist-Bold.ttf" : "Geist-Regular.ttf";
  const candidates = [
    path.join(
      process.cwd(),
      "node_modules",
      "geist",
      "dist",
      "fonts",
      "geist-sans",
      file,
    ),
    path.join(
      process.cwd(),
      "apps",
      "web",
      "node_modules",
      "geist",
      "dist",
      "fonts",
      "geist-sans",
      file,
    ),
  ];
  for (const p of candidates) {
    try {
      const buf = await readFile(p);
      return buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer;
    } catch {
      // try next
    }
  }
  return null;
}

interface RenderArgs {
  /** Big amber line, e.g. "Rokki" or a ticker like "DEALS-001". */
  primary: string;
  /** Smaller white line under the primary, e.g. tagline or terminal name. */
  secondary: string;
  /** Top-bar context. Defaults to "rokki.ai · terminal". */
  topLine?: string;
  /** Bottom rule label. Defaults to product summary. */
  bottomLabel?: string;
}

export async function renderOgImage(args: RenderArgs): Promise<ImageResponse> {
  const [regular, bold] = await Promise.all([
    loadGeist("regular"),
    loadGeist("bold"),
  ]);
  const topLine = args.topLine ?? "rokki.ai · terminal";
  const bottomLabel = args.bottomLabel ?? "Tasks · Files · MCP · Real-time";

  // Auto-shrink the primary line for long tickers so they don't blow the box.
  const primarySize =
    args.primary.length > 16
      ? 96
      : args.primary.length > 10
        ? 144
        : 200;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BG_0,
          color: TEXT_0,
          fontFamily: "Geist, sans-serif",
          padding: "72px",
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `linear-gradient(${BG_2} 1px, transparent 1px), linear-gradient(90deg, ${BG_2} 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
            opacity: 0.35,
            display: "flex",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 18,
            color: TEXT_3,
            letterSpacing: 1,
            textTransform: "uppercase",
            zIndex: 1,
          }}
        >
          <span style={{ color: ACCENT }}>●</span>
          <span>{topLine}</span>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            flex: 1,
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: primarySize,
              fontWeight: 700,
              letterSpacing: -6,
              lineHeight: 1,
              color: ACCENT,
              display: "flex",
            }}
          >
            {args.primary}
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 36,
              color: TEXT_0,
              fontWeight: 400,
              display: "flex",
              maxWidth: 980,
            }}
          >
            {args.secondary}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            paddingTop: 24,
            borderTop: `1px solid ${BG_2}`,
            fontSize: 18,
            color: TEXT_2,
            zIndex: 1,
          }}
        >
          <span>{bottomLabel}</span>
          <span style={{ color: TEXT_3 }}>v1</span>
        </div>
      </div>
    ),
    {
      ...OG_SIZE,
      fonts:
        regular && bold
          ? [
              { name: "Geist", data: regular, style: "normal", weight: 400 },
              { name: "Geist", data: bold, style: "normal", weight: 700 },
            ]
          : undefined,
    },
  );
}
