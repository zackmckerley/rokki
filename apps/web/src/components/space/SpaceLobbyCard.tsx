"use client";

import Link from "next/link";
import { Hash } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import type { SpaceLobbyMessage } from "@/lib/space-queries";

interface SpaceLobbyCardProps {
  spaceName: string;
  messages: SpaceLobbyMessage[];
  /** Whether a thread exists yet — when null we render a hint, not an error. */
  hasThread: boolean;
}

/**
 * Item #6 — last-N messages from the space's lobby thread,
 * scannable. Click anywhere in the card to open the full inbox.
 *
 * Author + body + relative timestamp; no rich rendering or
 * mention-highlight v1 — that lives in the dedicated
 * `MessagesInbox`.
 */
export function SpaceLobbyCard({
  spaceName,
  messages,
  hasThread,
}: SpaceLobbyCardProps) {
  return (
    <DashboardCard
      title="Messages"
      count={hasThread ? messages.length : undefined}
      expandHref="/messages"
    >
      {!hasThread ? (
        <p className="px-3 py-4 text-center text-[11px] text-text-3">
          No messages thread yet for {spaceName}. Open the inbox to
          start one.
        </p>
      ) : messages.length === 0 ? (
        <p className="px-3 py-4 text-center text-[11px] text-text-3">
          Quiet so far. Open the inbox to post the first message.
        </p>
      ) : (
        <ul className="divide-y divide-border/40 text-xs">
          {messages.slice(0, 8).map((m) => (
            <li key={m.id}>
              <Link
                href="/messages"
                className="flex items-start gap-2 px-3 py-1.5 hover:bg-bg-2"
              >
                <Hash
                  className="mt-0.5 h-3 w-3 flex-shrink-0 text-text-3"
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-text-0">
                      {m.author_name ?? "—"}
                    </span>
                    <span className="font-mono text-[10px] text-text-3">
                      {formatRelative(m.created_at)}
                    </span>
                  </div>
                  <div className="mt-0.5 truncate text-text-2">{m.body}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
