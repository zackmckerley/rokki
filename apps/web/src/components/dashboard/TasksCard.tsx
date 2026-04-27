"use client";

import Link from "next/link";
import { Check, Circle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard, CardSection } from "./DashboardCard";
import {
  PriorityDots,
  DueChip,
  TickerChip,
} from "@/components/primitives";
import type { AssignedTask, DelegatedTask } from "@/lib/dashboard-queries";

interface TasksCardProps {
  assigned: AssignedTask[];
  delegated: DelegatedTask[];
  /** Map terminal_id → ticker for rendering the ticker chip. */
  tickerById: Record<string, string>;
  /** Optional terminal_id → display name. Rendered after the ticker chip. */
  terminalNameById?: Record<string, string>;
}

/**
 * One master card with two stacked sub-sections.
 *
 *   ┌ TASKS ─────────────────┐
 *   │ ASSIGNED TO ME (5)     │
 *   │   task rows …          │
 *   │ DELEGATED (3)          │
 *   │   task rows …          │
 *   └────────────────────────┘
 *
 * Both lists visible at once so the user never has to tab-switch to see a
 * full picture. Overflow scrolls within the card body.
 */
export function TasksCard({
  assigned,
  delegated,
  tickerById,
  terminalNameById,
}: TasksCardProps) {
  // Show ~10 rows per the spec; users with more get a "see all" link to a
  // dedicated full-list page.
  const ROW_LIMIT = 10;
  return (
    <DashboardCard
      title="Tasks"
      count={assigned.length + delegated.length}
      expandHref="/tasks/mine"
    >
      <CardSection
        title="Assigned to me"
        count={assigned.length}
        action={
          assigned.length > ROW_LIMIT ? (
            <Link
              href="/tasks/mine"
              className="text-[10px] text-text-3 hover:text-text-0"
            >
              see all →
            </Link>
          ) : null
        }
      >
        {assigned.length === 0 ? (
          <EmptyAssigned />
        ) : (
          <ul className="divide-y divide-border/40">
            {assigned.slice(0, ROW_LIMIT).map((t) => (
              <AssignedRow
                key={t.id}
                task={t}
                ticker={tickerById[t.terminal_id]}
                terminalName={terminalNameById?.[t.terminal_id]}
              />
            ))}
          </ul>
        )}
      </CardSection>
      <CardSection
        title="I assigned to others"
        count={delegated.length}
        className="mt-1"
        action={
          delegated.length > ROW_LIMIT ? (
            <Link
              href="/tasks/delegated"
              className="text-[10px] text-text-3 hover:text-text-0"
            >
              see all →
            </Link>
          ) : null
        }
      >
        {delegated.length === 0 ? (
          <EmptyDelegated />
        ) : (
          <ul className="divide-y divide-border/40">
            {delegated.slice(0, ROW_LIMIT).map((t) => (
              <DelegatedRow
                key={t.id}
                task={t}
                ticker={tickerById[t.terminal_id]}
                terminalName={terminalNameById?.[t.terminal_id]}
              />
            ))}
          </ul>
        )}
      </CardSection>
    </DashboardCard>
  );
}

function AssignedRow({
  task,
  ticker,
  terminalName,
}: {
  task: AssignedTask;
  ticker?: string;
  terminalName?: string;
}) {
  // Deep-link to the task detail surface so a click puts the user one step
  // away from the work, not just on the parent terminal page.
  const href = ticker ? `/p/${ticker}/task/${task.ticker_seq}` : undefined;
  const body = (
    <div
      data-row
      className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-bg-2"
    >
      {task.status === "done" ? (
        <Check className="h-3 w-3 flex-shrink-0 text-success" />
      ) : (
        <Circle className="h-3 w-3 flex-shrink-0 text-text-3" />
      )}
      {ticker ? <TickerChip>{ticker}</TickerChip> : null}
      <span
        className={cn(
          "flex-1 truncate",
          task.status === "done" ? "text-text-3 line-through" : "text-text-0",
        )}
      >
        {task.title}
      </span>
      {terminalName ? (
        <span
          className="hidden truncate text-text-3 md:inline max-w-[10ch]"
          title={terminalName}
        >
          {terminalName}
        </span>
      ) : null}
      <PriorityDots priority={task.priority} />
      {task.due_date ? <DueChip date={task.due_date} /> : null}
    </div>
  );
  return href ? (
    <li>
      <Link href={href} className="block">
        {body}
      </Link>
    </li>
  ) : (
    <li>{body}</li>
  );
}

function DelegatedRow({
  task,
  ticker,
  terminalName,
}: {
  task: DelegatedTask;
  ticker?: string;
  terminalName?: string;
}) {
  const href = ticker ? `/p/${ticker}/task/${task.ticker_seq}` : undefined;
  const assigneeLabel = task.assignees
    .map((a) => a.full_name ?? "someone")
    .join(", ");
  const body = (
    <div
      data-row
      className="flex items-center gap-2 px-3 py-1 text-xs hover:bg-bg-2"
    >
      <ArrowRight className="h-3 w-3 flex-shrink-0 text-text-3" />
      {ticker ? <TickerChip>{ticker}</TickerChip> : null}
      <span className="flex-1 truncate text-text-0">{task.title}</span>
      <span
        className="hidden truncate text-text-2 md:inline max-w-[14ch]"
        title={assigneeLabel}
      >
        {assigneeLabel}
      </span>
      {terminalName ? (
        <span
          className="hidden truncate text-text-3 lg:inline max-w-[10ch]"
          title={terminalName}
        >
          {terminalName}
        </span>
      ) : null}
      <PriorityDots priority={task.priority} />
      {task.due_date ? <DueChip date={task.due_date} /> : null}
    </div>
  );
  return href ? (
    <li>
      <Link href={href} className="block">
        {body}
      </Link>
    </li>
  ) : (
    <li>{body}</li>
  );
}

function EmptyAssigned() {
  return (
    <p className="px-3 py-3 text-[11px] text-text-3">
      You&apos;re clear. Nothing currently assigned to you.
    </p>
  );
}
function EmptyDelegated() {
  return (
    <p className="px-3 py-3 text-[11px] text-text-3">
      Nothing waiting on others.
    </p>
  );
}

