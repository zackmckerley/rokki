import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import {
  PriorityDots,
  DueChip,
  TickerChip,
} from "@/components/primitives";
import type { ScopedTaskRow } from "@/lib/modules/tasks-queries";

interface Props {
  tasks: ScopedTaskRow[];
  title: string;
  emptyMessage?: string;
}

/**
 * Read-only list of tasks scoped to a space or terminal. Renders
 * inside a `DashboardCard` so the visual treatment matches the
 * existing tasks card on the dashboard.
 *
 * Phase 1: read-only. Phase 3+ wires in inline status toggle +
 * group-by (mirror the dashboard `TasksCard` interactions).
 */
export function ScopedTaskList({
  tasks,
  title,
  emptyMessage = "No open tasks at this scope.",
}: Props) {
  return (
    <DashboardCard
      title={title}
      count={tasks.length}
      expandHref={null}
      className="m-2 sm:m-3"
    >
      {tasks.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-text-3">
          {emptyMessage}
        </p>
      ) : (
        <ul className="divide-y divide-border/40">
          {tasks.map((t) => {
            const isDone = t.status === "done";
            const href = t.ticker
              ? `/p/${t.ticker}/task/${t.ticker_seq}`
              : undefined;
            const row = (
              <div className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-bg-2">
                <span
                  className={cn(
                    "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full border",
                    isDone
                      ? "border-success bg-success-subtle text-success"
                      : "border-text-3",
                  )}
                  aria-hidden="true"
                >
                  {isDone ? <Check className="h-2.5 w-2.5" /> : null}
                </span>
                {t.ticker ? <TickerChip>{t.ticker}</TickerChip> : null}
                <span
                  className={cn(
                    "flex-1 truncate",
                    isDone ? "text-text-3 line-through" : "text-text-0",
                  )}
                >
                  {t.title}
                </span>
                <span
                  className="hidden truncate text-text-3 md:inline max-w-[10ch]"
                  title={t.terminal_name}
                >
                  {t.terminal_name}
                </span>
                <PriorityDots priority={t.priority} />
                {t.due_date ? <DueChip date={t.due_date} /> : null}
              </div>
            );
            return (
              <li key={t.id}>
                {href ? (
                  <Link href={href} className="block">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
