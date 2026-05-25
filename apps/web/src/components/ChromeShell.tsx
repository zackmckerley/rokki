"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

/**
 * Client-side chrome wrapper used by the root layout.
 *
 * Exists for one reason: Next.js 15 doesn't allow
 * `dynamic({ ssr: false })` from a Server Component. The root
 * layout (`app/layout.tsx`) needs to remain a Server Component
 * for cookie reads + the `<html>` shell, so we pull the chrome
 * client components in here, behind a `"use client"` boundary,
 * where the lazy-load pattern is allowed.
 *
 * Each chrome component sits in its own chunk that loads after
 * hydration. Routes that never need them (login, share viewers,
 * the offline page) never trigger any of these chunks at all —
 * the components mount in the DOM as `null` placeholders until
 * something interactive happens. Routes that do need them
 * (dashboard, terminal pages) hydrate the visible page first,
 * then the chrome streams in.
 *
 * Why `ssr: false` for all of them: they're either invisible
 * (keyboard handlers, service worker register, toast portal),
 * interaction-gated (command palette, shortcuts overlay, escape
 * probe), or banners we can accept a frame of absence for.
 */
const CommandPalette = dynamic(
  () =>
    import("./CommandPalette").then((m) => ({ default: m.CommandPalette })),
  { ssr: false },
);
const GlobalShortcuts = dynamic(
  () =>
    import("./GlobalShortcuts").then((m) => ({ default: m.GlobalShortcuts })),
  { ssr: false },
);
const ServiceWorkerRegister = dynamic(
  () =>
    import("./ServiceWorkerRegister").then((m) => ({
      default: m.ServiceWorkerRegister,
    })),
  { ssr: false },
);
const ShortcutsOverlay = dynamic(
  () =>
    import("./ShortcutsOverlay").then((m) => ({ default: m.ShortcutsOverlay })),
  { ssr: false },
);
const SessionGuard = dynamic(
  () => import("./SessionGuard").then((m) => ({ default: m.SessionGuard })),
  { ssr: false },
);
const AnnouncementBanner = dynamic(
  () =>
    import("./AnnouncementBanner").then((m) => ({
      default: m.AnnouncementBanner,
    })),
  { ssr: false },
);
const MaintenanceBanner = dynamic(
  () =>
    import("./MaintenanceBanner").then((m) => ({
      default: m.MaintenanceBanner,
    })),
  { ssr: false },
);
const EscapeProbe = dynamic(
  () => import("./EscapeProbe").then((m) => ({ default: m.EscapeProbe })),
  { ssr: false },
);
const NavigationFallback = dynamic(
  () =>
    import("./NavigationFallback").then((m) => ({
      default: m.NavigationFallback,
    })),
  { ssr: false },
);
const Toaster = dynamic(
  () => import("./Toaster").then((m) => ({ default: m.Toaster })),
  { ssr: false },
);

export function ChromeShell({ children }: { children: ReactNode }) {
  return (
    <>
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
    </>
  );
}
