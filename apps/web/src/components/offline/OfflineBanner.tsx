"use client";

import Link from "next/link";
import { CloudOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Top-of-app banner shown only when the browser reports offline. Mirrors
 * MaintenanceBanner styling for visual consistency, but uses the warning
 * tone since "offline" is recoverable, not destructive.
 *
 * The link target (/offline) is the dedicated status page that lists
 * queued mutations and recently cached pages.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 border-b border-warning/40 bg-warning-subtle px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-warning"
    >
      <CloudOff className="h-3 w-3" />
      <span>You&apos;re offline.</span>
      <span className="font-normal normal-case tracking-normal text-text-2">
        Reads come from cache; writes are queued and will sync when you reconnect.
      </span>
      <Link
        href="/offline"
        className="ml-auto rounded-sm border border-warning/40 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warning hover:bg-warning/10"
      >
        View queue
      </Link>
    </div>
  );
}
