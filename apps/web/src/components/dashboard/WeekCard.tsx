"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Diamond, Calendar as CalIcon } from "lucide-react";
import { DashboardCard } from "./DashboardCard";
import type { WeekItem } from "@/lib/dashboard-queries";

interface WeekCardProps {
  items: WeekItem[];
}

/**
 * "This Week" list calendar. Rows are grouped by day. Each row is clickable
 * and jumps to its source (task detail) — the expand arrow goes to the
 * full /calendar view.
 *
 * Phase 1 only renders Rokki tasks with a due_date. External calendar
 * events land in a later slice when the sync connector is live.
 */
export function WeekCard({ items }: WeekCardProps) {
  const grouped = useMemo(() => {
    const days = new Map<string, WeekItem[]>();
    for (const it of items) {
      const key = it.when.slice(0, 10);
      if (!days.has(key)) days.set(key, []);
      days.get(key)!.push(it);
    }
    // Ensure we render every day of the current 7 even if empty.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const out: { key: string; label: string; items: WeekItem[] }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      out.push({
        key,
        label: formatDayLabel(d, i === 0),
        items: (days.get(key) ?? []).sort((a, b) =>
          a.when.localeCompare(b.when),
        ),
      });
    }
    return out;
  }, [items]);

  return (
    <DashboardCard
      title="This week"
      count={items.length}
      expandHref="/calendar"
    >
      {items.length === 0 ? (
        <EmptyWeek />
      ) : (
        <ul className="divide-y divide-border/60 text-xs">
          {grouped.map((day) => (
            <li key={day.key}>
              <div className="flex items-baseline gap-2 bg-bg-1 px-3 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-text-2">
                  {day.label}
                </span>
                <span className="font-mono text-[10px] text-text-3">
                  {day.items.length || ""}
                </span>
              </div>
              {day.items.length === 0 ? (
                <div className="px-3 py-1.5 text-[11px] text-text-3">—</div>
              ) : (
                <ul className="divide-y divide-border/40">
                  {day.items.map((it) => (
                    <WeekRow key={it.id} item={it} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}

function WeekRow({ item }: { item: WeekItem }) {
  const href = item.terminal_ticker
    ? `/p/${item.terminal_ticker}`
    : undefined;
  const content = (
    <div className="flex items-center gap-3 px-3 py-1.5 hover:bg-bg-2">
      <span className="flex h-4 w-12 flex-shrink-0 items-center justify-center font-mono text-[10px] text-text-3">
        {item.kind === "event" ? formatTime(item.when) : "due"}
      </span>
      {item.kind === "due" ? (
        <Diamond
          className="h-3 w-3 flex-shrink-0 text-warning"
          aria-hidden="true"
        />
      ) : (
        <CalIcon
          className="h-3 w-3 flex-shrink-0 text-info"
          aria-hidden="true"
        />
      )}
      <span className="flex-1 truncate text-text-0">{item.title}</span>
      {item.terminal_ticker ? (
        <span className="font-mono text-[10px] text-text-3">
          {item.terminal_ticker}
        </span>
      ) : null}
    </div>
  );
  return href ? (
    <li>
      <Link href={href} className="block">
        {content}
      </Link>
    </li>
  ) : (
    <li>{content}</li>
  );
}

function EmptyWeek() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
      <CalIcon className="h-5 w-5 text-text-3" aria-hidden="true" />
      <p className="text-xs text-text-2">Your week is clear.</p>
      <p className="text-[11px] text-text-3">
        Tasks with a due date will appear here.
      </p>
    </div>
  );
}

function formatDayLabel(d: Date, isToday: boolean): string {
  const fmt = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return isToday ? `Today · ${fmt}` : fmt;
}

function formatTime(iso: string): string {
  // Events have full datetimes; tasks-as-due have only YYYY-MM-DD.
  if (!iso.includes("T")) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
