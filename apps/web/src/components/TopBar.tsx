"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "./Wordmark";
import { TopBarSearch } from "./TopBarSearch";

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
      className="flex h-11 flex-shrink-0 items-center border-b border-border bg-bg-1 px-4"
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
      </div>
    </header>
  );
}
