"use client";

import { cn } from "@/lib/utils";

/**
 * Shared visual primitives. Use these everywhere instead of duplicating
 * inline markup. If you need a variant, add a prop here — don't fork.
 *
 *   <PriorityDots priority={1-4} />
 *   <StatusPill status="todo" | "in_progress" | "blocked" | "review" | "done" />
 *   <DueChip date="2026-04-25" />
 *   <Avatar name="Zack McKerley" online? size?="xs"|"sm"|"md" />
 *   <TickerChip>BRKL</TickerChip>
 */

/* -------------------------------------------------------------------- */
/* PriorityDots                                                           */
/* -------------------------------------------------------------------- */

export function PriorityDots({
  priority,
  className,
}: {
  priority: number;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label={`Priority ${priority}`}
      className={cn("flex items-center gap-0.5", className)}
    >
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          aria-hidden="true"
          className={cn(
            "h-1 w-1 rounded-full",
            n <= priority ? "bg-text-2" : "bg-bg-3",
          )}
        />
      ))}
    </span>
  );
}

/* -------------------------------------------------------------------- */
/* StatusPill                                                            */
/* -------------------------------------------------------------------- */

type TaskStatus = "todo" | "in_progress" | "blocked" | "review" | "done";

const STATUS_TONE: Record<TaskStatus, string> = {
  todo: "bg-bg-3 text-text-2",
  in_progress: "bg-info-subtle text-info",
  blocked: "bg-danger-subtle text-danger",
  review: "bg-warning-subtle text-warning",
  done: "bg-success-subtle text-success",
};
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "todo",
  in_progress: "in progress",
  blocked: "blocked",
  review: "review",
  done: "done",
};

export function StatusPill({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const s = (status as TaskStatus) in STATUS_TONE ? (status as TaskStatus) : "todo";
  return (
    <span
      className={cn(
        "rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide",
        STATUS_TONE[s],
        className,
      )}
    >
      {STATUS_LABEL[s]}
    </span>
  );
}

/* -------------------------------------------------------------------- */
/* DueChip                                                                */
/* -------------------------------------------------------------------- */

export function DueChip({
  date,
  className,
}: {
  /** ISO date (YYYY-MM-DD) or full datetime. */
  date: string;
  className?: string;
}) {
  const d = new Date(date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  const overdue = diff < 0;
  const soon = !overdue && diff <= 2;
  const label =
    diff === 0
      ? "today"
      : diff === 1
        ? "tmr"
        : diff === -1
          ? "yday"
          : diff > 0 && diff < 7
            ? `${diff}d`
            : diff < 0 && diff > -30
              ? `${-diff}d ago`
              : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <span
      className={cn(
        "font-mono text-[10px]",
        overdue ? "text-danger" : soon ? "text-warning" : "text-text-2",
        className,
      )}
    >
      {label}
    </span>
  );
}

/* -------------------------------------------------------------------- */
/* Avatar                                                                */
/* -------------------------------------------------------------------- */

const AVATAR_SIZES = {
  xs: "h-5 w-5 text-[10px]",
  sm: "h-6 w-6 text-[10px]",
  md: "h-8 w-8 text-xs",
};

export function Avatar({
  name,
  online,
  size = "sm",
  className,
}: {
  name: string | null;
  online?: boolean;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
}) {
  const initials = (name ?? "")
    .split(/\s+/)
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      role="img"
      aria-label={name ?? "user"}
      className={cn(
        "relative inline-flex flex-shrink-0 items-center justify-center rounded-full bg-bg-3 font-semibold text-text-1",
        AVATAR_SIZES[size],
        className,
      )}
    >
      <span aria-hidden="true">{initials || "?"}</span>
      {online ? (
        <span
          role="img"
          aria-label="online"
          className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full border border-bg-0 bg-success"
        />
      ) : null}
    </span>
  );
}

/* -------------------------------------------------------------------- */
/* TickerChip                                                            */
/* -------------------------------------------------------------------- */

export function TickerChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "rounded-sm bg-bg-2 px-1 font-mono text-[10px] text-text-3",
        className,
      )}
    >
      {children}
    </span>
  );
}
