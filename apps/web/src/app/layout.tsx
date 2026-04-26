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
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ShortcutsOverlay } from "@/components/ShortcutsOverlay";
import { SessionGuard } from "@/components/SessionGuard";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import { EscapeProbe } from "@/components/EscapeProbe";
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
    <html
      lang="en"
      data-theme="dark"
      className={`${GeistSans.variable} ${GeistMono.variable} ${Newsreader_.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Paint pure black before the CSS file even arrives. Without
            this the browser shows a flash of default white on cold
            loads (especially noticeable on the dark-themed login page
            with the nebula). */}
        <style>{`
          html, body { background: #000; }
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
                  if (t === "system" || !t) {
                    var mq = window.matchMedia("(prefers-color-scheme: dark)");
                    document.documentElement.dataset.theme = mq.matches ? "dark" : "light";
                  } else if (t === "light" || t === "dark") {
                    document.documentElement.dataset.theme = t;
                  }
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
        <MaintenanceBanner />
        <AnnouncementBanner />
        <CommandPalette>{children}</CommandPalette>
        <ShortcutsOverlay />
        <SessionGuard />
        <EscapeProbe />
        <ServiceWorkerRegister />
        <Toaster />
      </body>
    </html>
  );
}
