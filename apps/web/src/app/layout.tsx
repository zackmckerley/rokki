import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Newsreader } from "next/font/google";

/**
 * Editorial display font for major headings and the wordmark.
 * Paired with Geist body — distinctive serif against the dense
 * mono/sans ground keeps Rokki out of generic-AI-aesthetic territory
 * without abandoning the Bloomberg-terminal POV. Subset to Latin to
 * keep the bundle tight; weights 500/700 only.
 */
const Newsreader_ = Newsreader({
  subsets: ["latin"],
  weight: ["500", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display-loaded",
});
import { CommandPalette } from "@/components/CommandPalette";
import { GlobalShortcuts } from "@/components/GlobalShortcuts";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ShortcutsOverlay } from "@/components/ShortcutsOverlay";
import { SessionGuard } from "@/components/SessionGuard";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { EscapeProbe } from "@/components/EscapeProbe";
import { NavigationFallback } from "@/components/NavigationFallback";
import { Toaster } from "@/components/Toaster";
import "./globals.css";

const ROKKI_DESCRIPTION = "The terminal for your projects.";

export const metadata: Metadata = {
  title: "Rokki",
  description: ROKKI_DESCRIPTION,
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Rokki",
  },
  openGraph: {
    siteName: "Rokki",
    title: "Rokki",
    description: ROKKI_DESCRIPTION,
    type: "website",
    // Picked up automatically from `app/opengraph-image.tsx`. Listing it
    // explicitly keeps validators that don't run the file convention
    // happy (e.g. some Slack preview tools).
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Rokki",
    description: ROKKI_DESCRIPTION,
    images: ["/twitter-image"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0B0D",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // No `data-theme` on <html> here. The bootstrap script in <head>
    // owns that attribute — it reads localStorage before first paint
    // and assigns "light", "dark", or the resolved system preference.
    // Putting `data-theme="dark"` in JSX caused React to silently
    // overwrite the script's value back to dark on subsequent
    // renders, which is what manifested as "the page keeps flipping
    // back to dark even though I set light." Same pattern that
    // `data-density` already follows (also script-managed, never in
    // JSX). `suppressHydrationWarning` keeps React from warning when
    // the SSR HTML and the script-mutated DOM differ on either
    // attribute.
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${Newsreader_.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Cut latency on the first API roundtrip. Browsers open a TCP
            handshake + TLS session against Supabase the moment the
            HTML lands, so by the time React hydrates and dispatches
            its first `supabase.from(...)` the connection is already
            warm. ~100-300ms saved on cold visits. */}
        {process.env.NEXT_PUBLIC_SUPABASE_URL ? (
          <>
            <link
              rel="preconnect"
              href={process.env.NEXT_PUBLIC_SUPABASE_URL}
              crossOrigin="anonymous"
            />
            <link
              rel="dns-prefetch"
              href={process.env.NEXT_PUBLIC_SUPABASE_URL}
            />
          </>
        ) : null}
        {/* Paint pure black before the CSS file even arrives. Without
            this the browser shows a flash of default white on cold
            loads — especially noticeable on cross-page navigations
            that fall through the NavigationFallback (which does a
            window.location.assign hard-reload because the App Router's
            client-side router.push is silently no-op'ing on terminal
            pages — see NavigationFallback for context).

            Three layers of dark-mode hint, in order of speed:
              1. color-scheme: dark on <html> — tells the browser to
                 paint native widgets (scrollbars, form chrome,
                 background) in dark colors immediately. Renders
                 before any CSS is parsed.
              2. html, body background-color: #000 — covers any visible
                 area until our stylesheets arrive.
              3. body color: #f5f5f5 — placeholder light foreground for
                 the same window. Real text colors land with the real
                 stylesheet a few ms later. */}
        <style>{`
          html { color-scheme: dark; }
          html, body { background: #000; color: #f5f5f5; }
          :root {
            --font-sans: ${GeistSans.style.fontFamily};
            --font-mono: ${GeistMono.style.fontFamily};
            --font-display: var(--font-display-loaded), "GT Sectra", "Source Serif Pro", Georgia, serif;
          }
        `}</style>
        {/*
         * Theme bootstrap. Reads localStorage before first paint so the
         * user's choice lands without a dark-to-light flash. Density is
         * also cached here for the same reason.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var t = localStorage.getItem("rokki_theme");
                  var resolved = "dark";
                  if (t === "system" || !t) {
                    var mq = window.matchMedia("(prefers-color-scheme: dark)");
                    resolved = mq.matches ? "dark" : "light";
                  } else if (t === "light" || t === "dark") {
                    resolved = t;
                  }
                  document.documentElement.dataset.theme = resolved;
                  // Mirror the resolved theme onto color-scheme so the
                  // browser repaints native chrome (scrollbars, form
                  // controls) the moment localStorage is read. The
                  // inline <style> above defaults to dark; flip to light
                  // here when needed before any further paint.
                  document.documentElement.style.colorScheme = resolved;
                  var d = localStorage.getItem("rokki_density");
                  if (d === "compact" || d === "cozy") {
                    document.documentElement.dataset.density = d;
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-bg-0 font-sans text-base text-text-0 antialiased">
        {/* Skip-to-main — visually hidden until focused, then anchors past
            the top bar / sidebars. Pages that have a #main-content target
            (the dashboard, admin shell, settings, help) get a real jump;
            pages without one fall through harmlessly. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[2000] focus:rounded focus:bg-accent focus:px-3 focus:py-1.5 focus:text-xs focus:font-semibold focus:text-bg-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          Skip to main content
        </a>
        <MaintenanceBanner />
        <AnnouncementBanner />
        <CommandPalette>
          <GlobalShortcuts />
          {children}
        </CommandPalette>
        <ShortcutsOverlay />
        <SessionGuard />
        <EscapeProbe />
        <NavigationFallback />
        <ServiceWorkerRegister />
        <Toaster />
      </body>
    </html>
  );
}
