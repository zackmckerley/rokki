"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { TickerChip } from "@/components/primitives";
import type { SpaceFileRow } from "@/lib/space-queries";

interface SpaceFilesCardProps {
  files: SpaceFileRow[];
}

/**
 * Item #7 — most-recent file uploads across every terminal in
 * the space. Files are still per-terminal in the schema; this is
 * a simple cross-terminal "what got uploaded recently" view, the
 * real "files vault" lands when the schema gets a space-level
 * scope.
 */
export function SpaceFilesCard({ files }: SpaceFilesCardProps) {
  return (
    <DashboardCard
      title="Recent files"
      count={files.length}
      expandHref={null}
    >
      {files.length === 0 ? (
        <p className="px-3 py-4 text-center text-[11px] text-text-3">
          No files uploaded yet in this space.
        </p>
      ) : (
        <ul className="divide-y divide-border/40 text-xs">
          {files.slice(0, 10).map((f) => (
            <li key={f.id}>
              <Link
                href={
                  f.terminal_ticker ? `/p/${f.terminal_ticker}` : "#"
                }
                className="flex items-center gap-2 px-3 py-1 hover:bg-bg-2"
              >
                <FileText
                  className="h-3 w-3 flex-shrink-0 text-text-3"
                  aria-hidden="true"
                />
                {f.terminal_ticker ? (
                  <TickerChip>{f.terminal_ticker}</TickerChip>
                ) : null}
                <span className="flex-1 truncate text-text-0">
                  {f.filename}
                </span>
                <span className="font-mono text-[10px] text-text-3">
                  {formatRelative(f.uploaded_at)}
                </span>
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
