"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { StatusPill } from "@/components/primitives";
import type { SpaceTerminalCard } from "@/lib/space-queries";

interface TerminalsGridProps {
  terminals: SpaceTerminalCard[];
  /**
   * Optional click handler for the "+ Terminal" affordance. When
   * supplied the card sprouts a button in its header AND a tile in
   * the grid (or a prominent CTA in the empty state) so the user can
   * spin up a new terminal without bouncing through the command
   * palette. Wired up by SpaceClient → CreateProjectDialog.
   */
  onCreateTerminal?: () => void;
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
export function TerminalsGrid({ terminals, onCreateTerminal }: TerminalsGridProps) {
  return (
    <DashboardCard
      title="Terminals"
      count={terminals.length}
      expandHref={null}
      headerRight={
        onCreateTerminal ? (
          <button
            type="button"
            onClick={onCreateTerminal}
            title="Create a new terminal in this space"
            className="flex items-center gap-1 rounded-sm border border-border bg-bg-2 px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-1 hover:border-accent/40 hover:bg-bg-3"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
            <span>New terminal</span>
          </button>
        ) : null
      }
    >
      {terminals.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 px-3 py-10 text-center">
          <p className="text-xs text-text-3">
            No terminals in this space yet.
          </p>
          {onCreateTerminal ? (
            <button
              type="button"
              onClick={onCreateTerminal}
              className="inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent hover:bg-accent/20"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              Create the first terminal
            </button>
          ) : null}
        </div>
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
          {onCreateTerminal ? (
            <li>
              <button
                type="button"
                onClick={onCreateTerminal}
                className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-sm border border-dashed border-border bg-bg-1 p-3 text-text-3 transition-colors hover:border-accent/40 hover:bg-bg-2 hover:text-accent"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="text-[11px] font-semibold uppercase tracking-wide">
                  New terminal
                </span>
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </DashboardCard>
  );
}
