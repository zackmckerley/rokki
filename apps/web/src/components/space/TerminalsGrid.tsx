"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatusPill } from "@/components/primitives";
import type { SpaceTerminalCard } from "@/lib/space-queries";

interface TerminalsGridProps {
  terminals: SpaceTerminalCard[];
}

/**
 * Item #1 from the space-page list — every terminal in the space
 * as a tile. Header shows the count; each tile is the ticker /
 * name / status pill / member count / open-task count.
 *
 * Deliberately information-dense and grid-rather-than-list-style:
 * this is the part of the page that says "what does this space
 * actually do." Click a tile to enter the terminal.
 */
export function TerminalsGrid({ terminals }: TerminalsGridProps) {
  return (
    <DashboardCard
      title="Terminals"
      count={terminals.length}
      expandHref={null}
    >
      {terminals.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-text-3">
          No terminals in this space yet.
        </p>
      ) : (
        <ul className="grid gap-2 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {terminals.map((t) => (
            <li key={t.id}>
              <Link
                href={`/p/${t.ticker}`}
                className="group flex h-full flex-col gap-2 rounded-sm border border-border bg-bg-2 p-3 transition-colors hover:border-accent/40 hover:bg-bg-3"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-semibold text-accent">
                    {t.ticker}
                  </span>
                  <span className="flex-1 truncate text-xs text-text-0">
                    {t.name}
                  </span>
                  <ArrowRight
                    className="h-3 w-3 flex-shrink-0 text-text-3 opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden="true"
                  />
                </div>
                <div className="flex items-center gap-2 text-[10px] text-text-3">
                  <StatusPill status={t.status} />
                  <span>·</span>
                  <span title={`${t.member_count} member${t.member_count === 1 ? "" : "s"}`}>
                    {t.member_count} member{t.member_count === 1 ? "" : "s"}
                  </span>
                </div>
                <div
                  className={cn(
                    "font-mono text-[10px]",
                    t.open_task_count > 0 ? "text-text-1" : "text-text-3",
                  )}
                >
                  {t.open_task_count > 0
                    ? `${t.open_task_count} open task${t.open_task_count === 1 ? "" : "s"}`
                    : "no open tasks"}
                  {t.done_task_count > 0 ? (
                    <span className="text-text-3">
                      {" "}· {t.done_task_count} done
                    </span>
                  ) : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
