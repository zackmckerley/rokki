import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { CommandPalette } from "@/components/CommandPalette";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ShortcutsOverlay } from "@/components/ShortcutsOverlay";
import { SessionGuard } from "@/components/SessionGuard";
import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { MaintenanceBanner } from "@/components/MaintenanceBanner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rokki",
  description: "The terminal for your projects.",
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
      className={`${GeistSans.variable} ${GeistMono.variable}`}
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
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
