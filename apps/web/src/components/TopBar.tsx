"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";
import { TopBarSearch } from "./TopBarSearch";

// Lazy-load the bell so its realtime subscription + dropdown body
// only ship when the user is past authentication. Saves ~12 KB off
// the login page bundle, which doesn't need notification chrome at
// all. SSR off because the closed dropdown has no useful server
// render and the unread count is realtime-driven anyway.
const NotificationBell = dynamic(
  () =>
    import("./NotificationBell").then((m) => ({
      default: m.NotificationBell,
    })),
  { ssr: false },
);

interface TopBarProps {
  children?: React.ReactNode;
}

/**
 * Top bar — §6.3 BUILD_SPEC and §08.5.4 UI design.
 * 44px tall, Rokki wordmark at left, slot for breadcrumb, persistent
 * search bar at right (clicks open the command palette).
 *
 * Account-related actions (multi-account ring, sign out, settings, density,
 * admin console toggle) live in the bottom-left ExplorerRail's AccountBlock
 * so the top-right stays uncluttered.
 *
 * The wordmark is *contextual*: clicking it from /admin/* lands you on
 * the admin overview (/admin), not the user dashboard. Avoids the
 * "I clicked the logo and got bounced out of admin" surprise.
 */
export function TopBar({ children }: TopBarProps) {
  const pathname = usePathname();
  const homeHref = pathname?.startsWith("/admin") ? "/admin" : "/";
  return (
    <header
      className="flex h-[var(--rk-topbar-h)] flex-shrink-0 items-center border-b border-border bg-bg-1 px-4"
      role="banner"
    >
      <Link
        href={homeHref}
        className="flex items-center gap-3 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        aria-label={
          homeHref === "/admin" ? "Admin overview" : "Rokki home"
        }
      >
        <Wordmark size="md" />
      </Link>
      <div className="ml-3 flex flex-1 items-center gap-2 text-xs text-text-2">
        {children}
      </div>
      <div className="flex items-center gap-2">
        <TopBarSearch />
        {/* Bell is hidden on the login / signup / public-help routes
            (everything outside /admin and /(auth)). The component
            itself no-ops when there's no auth'd user, but
            short-circuiting here keeps the topbar visually clean on
            those pages too. */}
        {pathname && !pathname.startsWith("/login") ? (
          <NotificationBell />
        ) : null}
      </div>
    </header>
  );
}
