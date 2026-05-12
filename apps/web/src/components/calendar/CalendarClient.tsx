"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Diamond,
  Calendar as CalIcon,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  CalendarItem,
  CalendarSource,
  CalendarView,
} from "@/lib/calendar-queries";

interface Props {
  view: CalendarView;
  refDate: string;
  sources: CalendarSource[];
  hiddenSourceIds: string[];
  items: CalendarItem[];
}

/**
 * Calendar shell — owns the view toggle (Today/Week/Month), the
 * date navigation arrows, the source filter chips, and routes the
 * inner render to whichever view component the user picked.
 *
 * State is URL-driven (`?view=`, `?date=`, `?sources=`). Clicks
 * push a new URL; the server-side loader re-runs and feeds fresh
 * `items`. This makes deep-linking ("show me last Monday's
 * calendar") and browser-back work for free.
 */
export function CalendarClient({
  view,
  refDate,
  sources,
  hiddenSourceIds,
  items,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hiddenSet = useMemo(() => new Set(hiddenSourceIds), [hiddenSourceIds]);

  /** Push a new ?view= / ?date= / ?sources= without re-typing the rest. */
  function navigate(patch: {
    view?: CalendarView;
    date?: string;
    sources?: string[] | null;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    if (patch.view !== undefined) params.set("view", patch.view);
    if (patch.date !== undefined) params.set("date", patch.date);
    if (patch.sources !== undefined) {
      if (patch.sources == null || patch.sources.length === 0) {
        params.delete("sources");
      } else {
        params.set("sources", patch.sources.join(","));
      }
    }
    router.push(`/calendar${params.size ? `?${params.toString()}` : ""}`);
  }

  function toggleSource(id: string) {
    const next = new Set(hiddenSourceIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    navigate({ sources: Array.from(next) });
  }

  function shiftDate(delta: number) {
    const [y, m, d] = refDate.split("-").map(Number);
    const next = new Date(y, (m ?? 1) - 1, d ?? 1);
    if (view === "today") next.setDate(next.getDate() + delta);
    else if (view === "week") next.setDate(next.getDate() + delta * 7);
    else next.setMonth(next.getMonth() + delta);
    navigate({ date: next.toISOString().slice(0, 10) });
  }

  const heading = useMemo(() => {
    const [y, m, d] = refDate.split("-").map(Number);
    const ref = new Date(y, (m ?? 1) - 1, d ?? 1);
    if (view === "today")
      return ref.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });
    if (view === "week") {
      const end = new Date(ref);
      end.setDate(end.getDate() + 6);
      return `${ref.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    }
    return ref.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });
  }, [view, refDate]);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar: view toggle + nav + source filter */}
      <header className="flex flex-wrap items-center gap-2 rounded border border-border bg-bg-1 px-3 py-2">
        <ViewToggle
          current={view}
          onPick={(v) => navigate({ view: v, date: refDate })}
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => shiftDate(-1)}
            className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              navigate({
                date: new Date().toISOString().slice(0, 10),
              })
            }
            className="rounded-sm border border-border bg-bg-2 px-2 py-0.5 text-[11px] uppercase tracking-wide text-text-1 hover:bg-bg-3"
          >
            Today
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => shiftDate(1)}
            className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <h2 className="ml-2 flex-1 text-sm font-semibold text-text-0">
          {heading}
        </h2>
        <SourceFilter
          sources={sources}
          hidden={hiddenSet}
          onToggle={toggleSource}
        />
      </header>

      {/* Body */}
      {items.length === 0 ? (
        <EmptyState
          message={
            sources.length <= 1
              ? "No tasks or events in this range. Connect a calendar in Settings to see external events."
              : "Nothing in this range — try a different view or unhide a source."
          }
        />
      ) : view === "today" ? (
        <TodayView items={items} />
      ) : view === "week" ? (
        <WeekView items={items} refDate={refDate} />
      ) : (
        <MonthView items={items} refDate={refDate} />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Toolbar                                                            */
/* ----------------------------------------------------------------- */

function ViewToggle({
  current,
  onPick,
}: {
  current: CalendarView;
  onPick: (v: CalendarView) => void;
}) {
  const options: { value: CalendarView; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Calendar view"
      className="flex overflow-hidden rounded-sm border border-border"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={current === o.value}
          onClick={() => onPick(o.value)}
          className={cn(
            "px-2.5 py-1 text-[11px] uppercase tracking-wide",
            current === o.value
              ? "bg-bg-3 text-text-0"
              : "bg-bg-2 text-text-2 hover:bg-bg-3 hover:text-text-1",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SourceFilter({
  sources,
  hidden,
  onToggle,
}: {
  sources: CalendarSource[];
  hidden: Set<string>;
  onToggle: (id: string) => void;
}) {
  const visibleCount = sources.length - hidden.size;
  return (
    <details className="relative">
      <summary
        className="flex cursor-pointer items-center gap-1 rounded-sm border border-border bg-bg-2 px-2 py-1 text-[11px] uppercase tracking-wide text-text-1 hover:bg-bg-3 [&::-webkit-details-marker]:hidden"
        title="Filter calendar sources"
      >
        <Filter className="h-3 w-3" />
        <span>
          {visibleCount}/{sources.length} sources
        </span>
      </summary>
      <ul className="absolute right-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-sm border border-border bg-bg-1 py-1 text-xs shadow-lg">
        {sources.map((s) => {
          const isHidden = hidden.has(s.id);
          return (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onToggle(s.id)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-text-1 hover:bg-bg-2",
                  isHidden && "text-text-3",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2 w-2 flex-shrink-0 rounded-full",
                    s.kind === "tasks"
                      ? "bg-warning"
                      : s.provider === "google"
                        ? "bg-info"
                        : "bg-accent",
                    isHidden && "opacity-30",
                  )}
                />
                <span className="flex-1 truncate">{s.label}</span>
                {s.kind === "connection" ? (
                  <span className="font-mono text-[10px] uppercase text-text-3">
                    {s.provider === "google" ? "Google" : "Outlook"}
                  </span>
                ) : null}
                <span className="text-[10px] uppercase text-text-3">
                  {isHidden ? "Off" : "On"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/* ----------------------------------------------------------------- */
/* Views                                                              */
/* ----------------------------------------------------------------- */

function TodayView({ items }: { items: CalendarItem[] }) {
  return (
    <div className="rounded border border-border bg-bg-1">
      <ul className="divide-y divide-border/60">
        {items.map((it) => (
          <li key={`${it.kind}:${it.id}`}>
            <CalendarItemRow item={it} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function WeekView({
  items,
  refDate,
}: {
  items: CalendarItem[];
  refDate: string;
}) {
  const days = useMemo(() => buildDayRange(refDate, 7), [refDate]);
  const itemsByDay = useMemo(() => groupByDate(items), [items]);
  return (
    <div className="rounded border border-border bg-bg-1">
      <ul className="divide-y divide-border/60">
        {days.map((d) => {
          const list = itemsByDay.get(d.date) ?? [];
          return (
            <li key={d.date}>
              <div className="flex items-baseline gap-2 bg-bg-2 px-3 py-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-text-2">
                  {d.label}
                </span>
                <span className="font-mono text-[10px] text-text-3">
                  {list.length || ""}
                </span>
              </div>
              {list.length === 0 ? (
                <p className="px-3 py-1.5 text-[11px] text-text-3">—</p>
              ) : (
                <ul className="divide-y divide-border/40">
                  {list.map((it) => (
                    <li key={`${it.kind}:${it.id}`}>
                      <CalendarItemRow item={it} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MonthView({
  items,
  refDate,
}: {
  items: CalendarItem[];
  refDate: string;
}) {
  // Build 6 weeks × 7 days = 42 cells covering the calendar month
  // plus the lead-in/trail-out days from sibling months. Starts on
  // Sunday — matches Google / Outlook defaults.
  const cells = useMemo(() => buildMonthCells(refDate), [refDate]);
  const itemsByDay = useMemo(() => groupByDate(items), [items]);
  const monthRef = useMemo(() => {
    const [y, m] = refDate.split("-").map(Number);
    return { year: y ?? 1970, month: (m ?? 1) - 1 };
  }, [refDate]);
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div className="rounded border border-border bg-bg-1">
      <div className="grid grid-cols-7 border-b border-border bg-bg-2 text-[10px] font-semibold uppercase tracking-wide text-text-3">
        {dayNames.map((d) => (
          <span key={d} className="px-2 py-1">
            {d}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          const list = itemsByDay.get(cell.date) ?? [];
          const inMonth = cell.month === monthRef.month;
          return (
            <div
              key={cell.date}
              className={cn(
                "flex min-h-[88px] flex-col gap-0.5 border-b border-r border-border/40 p-1 text-[10px]",
                !inMonth && "bg-bg-0 text-text-3",
                cell.isToday && "bg-accent-subtle/30",
              )}
            >
              <span
                className={cn(
                  "font-mono text-text-2",
                  cell.isToday && "text-accent",
                )}
              >
                {cell.dayOfMonth}
              </span>
              {list.slice(0, 3).map((it) => (
                <CalendarChip key={`${it.kind}:${it.id}`} item={it} />
              ))}
              {list.length > 3 ? (
                <span className="text-[10px] text-text-3">
                  +{list.length - 3} more
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Row + chip + empty                                                 */
/* ----------------------------------------------------------------- */

function CalendarItemRow({ item }: { item: CalendarItem }) {
  const href =
    item.kind === "due" && item.terminal_ticker && item.ticker_seq != null
      ? `/p/${item.terminal_ticker}/task/${item.ticker_seq}`
      : item.terminal_ticker
        ? `/p/${item.terminal_ticker}`
        : null;
  const body = (
    <div className="flex items-center gap-3 px-3 py-1.5 text-xs hover:bg-bg-2">
      <span className="flex h-4 w-12 flex-shrink-0 items-center justify-center font-mono text-[10px] text-text-3">
        {item.all_day ? "all day" : formatTime(item.when)}
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
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function CalendarChip({ item }: { item: CalendarItem }) {
  return (
    <span
      className="flex items-center gap-1 truncate rounded-sm bg-bg-3 px-1 py-0.5 text-text-1"
      title={item.title}
    >
      {item.kind === "due" ? (
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-warning" />
      ) : (
        <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-info" />
      )}
      <span className="truncate">{item.title}</span>
    </span>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded border border-border bg-bg-1 p-10 text-center">
      <CalendarDays className="h-5 w-5 text-text-3" aria-hidden="true" />
      <p className="text-sm text-text-1">Nothing scheduled.</p>
      <p className="max-w-sm text-xs text-text-3">{message}</p>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Helpers                                                            */
/* ----------------------------------------------------------------- */

function buildDayRange(
  startDate: string,
  count: number,
): { date: string; label: string }[] {
  const [y, m, d] = startDate.split("-").map(Number);
  const start = new Date(y, (m ?? 1) - 1, d ?? 1);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }).map((_, i) => {
    const cur = new Date(start);
    cur.setDate(cur.getDate() + i);
    const iso = cur.toISOString().slice(0, 10);
    const isToday = cur.getTime() === today.getTime();
    const fmt = cur.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    return { date: iso, label: isToday ? `Today · ${fmt}` : fmt };
  });
}

interface MonthCell {
  date: string;
  dayOfMonth: number;
  month: number;
  isToday: boolean;
}

function buildMonthCells(refDate: string): MonthCell[] {
  const [y, m] = refDate.split("-").map(Number);
  const first = new Date(y ?? 1970, (m ?? 1) - 1, 1);
  // Walk back to Sunday of the first row.
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: 42 }).map((_, i) => {
    const cur = new Date(start);
    cur.setDate(cur.getDate() + i);
    return {
      date: cur.toISOString().slice(0, 10),
      dayOfMonth: cur.getDate(),
      month: cur.getMonth(),
      isToday: cur.getTime() === today.getTime(),
    };
  });
}

function groupByDate(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const byDay = new Map<string, CalendarItem[]>();
  for (const it of items) {
    if (!byDay.has(it.date)) byDay.set(it.date, []);
    byDay.get(it.date)!.push(it);
  }
  return byDay;
}

function formatTime(iso: string): string {
  if (!iso.includes("T")) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
