import Link from "next/link";
import { Wordmark } from "./Wordmark";

interface TopBarProps {
  children?: React.ReactNode;
}

/**
 * Top bar — §6.3 BUILD_SPEC and §08.5.4 UI design.
 * 44px tall, Rokki wordmark at left, slot for breadcrumb, ⌘K hint at right.
 *
 * The former notification bell has been removed — updates flow through the
 * ticker tape directly below the top bar. Keep this slim.
 */
export function TopBar({ children }: TopBarProps) {
  return (
    <header
      className="flex h-11 flex-shrink-0 items-center border-b border-border bg-bg-1 px-4"
      role="banner"
    >
      <Link
        href="/"
        className="flex items-center gap-3 rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        aria-label="Rokki home"
      >
        <Wordmark size="md" />
      </Link>
      <div className="ml-3 flex flex-1 items-center gap-2 text-xs text-text-2">
        {children}
      </div>
      <div className="flex items-center gap-2">
        <kbd className="rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 font-mono text-xs text-text-2">
          ⌘K
        </kbd>
      </div>
    </header>
  );
}
