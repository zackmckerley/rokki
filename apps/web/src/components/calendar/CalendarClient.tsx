"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Diamond,
  Calendar as CalIcon,
  Filter,
  X,
  MapPin,
  ExternalLink,
  Repeat,
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
 * Calendar shell — owns the view toggle (Day/Week/Month), the
 * date navigation arrows, the source filter chips, and routes the
 * inner render to whichever view component the user picked.
 *
 * State is URL-driven (`?view=`, `?date=`, `?sources=`,
 * `?selected=`). Clicks push a new URL; the server-side loader
 * re-runs and feeds fresh `items`. This makes deep-linking
 * ("show me last Monday's calendar") and browser-back work for
 * free. The `?selected=` param is read by the details drawer so
 * a shared link can open straight to a specific event.
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
  const selectedKey = searchParams.get("selected");
  const selectedItem = useMemo(() => {
    if (!selectedKey) return null;
    const [kind, id] = selectedKey.split(":");
    return items.find((it) => it.kind === kind && it.id === id) ?? null;
  }, [items, selectedKey]);

  /** Push a new ?view= / ?date= / ?sources= / ?selected= without re-typing the rest. */
  function navigate(patch: {
    view?: CalendarView;
    date?: string;
    sources?: string[] | null;
    selected?: string | null;
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
    if (patch.selected !== undefined) {
      if (patch.selected == null) params.delete("selected");
      else params.set("selected", patch.selected);
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

  function openItem(item: CalendarItem) {
    navigate({ selected: `${item.kind}:${item.id}` });
  }

  function closeDrawer() {
    navigate({ selected: null });
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
        <DayView items={items} refDate={refDate} onOpen={openItem} />
      ) : view === "week" ? (
        <WeekView items={items} refDate={refDate} onOpen={openItem} />
      ) : (
        <MonthView items={items} refDate={refDate} onOpen={openItem} />
      )}

      {/* Drawer */}
      {selectedItem ? (
        <DetailsDrawer item={selectedItem} onClose={closeDrawer} />
      ) : null}
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
    { value: "today", label: "Day" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Calendar view"
      className="flex overflow-hidden rounded-sm border border-border"
    >
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={current === o.value}
          onClick={() => onPick(o.value)}
          className={cn(
            "px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
            // Visible separators between buttons — without these the
            // three labels collide into one unreadable "DAYWEEKMONTH"
            // mash on the dark theme. The container border alone is
            // outside the buttons; this draws the inside dividers.
            i > 0 && "border-l border-border",
            current === o.value
              ? "bg-accent text-bg-0"
              : "bg-bg-2 text-text-2 hover:bg-bg-3 hover:text-text-0",
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
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visibleCount = sources.length - hidden.size;

  // Close on outside click. Native `<details>` doesn't give us
  // enough hover/focus control to read as "filter", so this is a
  // custom popover. Same dismissal pattern the other Rokki menus
  // use.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        title="Filter calendar sources"
        className={cn(
          "flex items-center gap-1.5 rounded-sm border border-border px-2 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors",
          open
            ? "bg-bg-3 text-text-0"
            : "bg-bg-2 text-text-1 hover:bg-bg-3 hover:text-text-0",
        )}
      >
        <Filter className="h-3 w-3" />
        <span>Filter</span>
        <span className="rounded-sm bg-bg-3 px-1 font-mono text-[10px] text-text-2">
          {visibleCount}/{sources.length}
        </span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-sm border border-border bg-bg-1 shadow-lg">
          <header className="flex items-center justify-between border-b border-border bg-bg-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            <span>Calendars</span>
            <span className="font-mono text-text-2">
              {visibleCount} of {sources.length} shown
            </span>
          </header>
          <ul className="max-h-80 overflow-y-auto py-1 text-xs">
            {sources.map((s) => {
              const isHidden = hidden.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-text-1 hover:bg-bg-2",
                      isHidden && "text-text-3",
                    )}
                  >
                    {/* Checkbox-style indicator — reads as "click to
                        toggle" much more clearly than the previous
                        On/Off label did. */}
                    <span
                      className={cn(
                        "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-sm border",
                        isHidden
                          ? "border-border bg-bg-0"
                          : "border-accent bg-accent text-bg-0",
                      )}
                      aria-hidden="true"
                    >
                      {!isHidden ? <Check className="h-3 w-3" /> : null}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "h-2 w-2 flex-shrink-0 rounded-full",
                        sourceTone(s),
                        isHidden && "opacity-30",
                      )}
                    />
                    <span className="flex-1 truncate">{s.label}</span>
                    {s.kind === "connection" ? (
                      <span className="font-mono text-[10px] uppercase text-text-3">
                        {s.provider === "google" ? "Google" : "Outlook"}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Day view — hour grid with positioned blocks                        */
/* ----------------------------------------------------------------- */

/**
 * Hour-grid bounds. 6 AM → 10 PM covers the realistic workday
 * envelope without leaving a tall stretch of blank cells for
 * overnight events. Events outside this range clamp to the edges.
 */
const DAY_GRID_START_HOUR = 6;
const DAY_GRID_END_HOUR = 22;
const HOUR_HEIGHT_PX = 48;
const DAY_GRID_HEIGHT = (DAY_GRID_END_HOUR - DAY_GRID_START_HOUR) * HOUR_HEIGHT_PX;

function DayView({
  items,
  refDate,
  onOpen,
}: {
  items: CalendarItem[];
  refDate: string;
  onOpen: (item: CalendarItem) => void;
}) {
  const dayItems = useMemo(
    () => items.filter((it) => it.date === refDate),
    [items, refDate],
  );
  const allDay = dayItems.filter((it) => it.all_day);
  const timed = dayItems.filter((it) => !it.all_day);

  return (
    <div className="overflow-hidden rounded border border-border bg-bg-1">
      {allDay.length > 0 ? (
        <div className="border-b border-border bg-bg-2 px-3 py-1.5">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-text-3">
            All day
          </p>
          <ul className="flex flex-wrap gap-1">
            {allDay.map((it) => (
              <li key={`${it.kind}:${it.id}`}>
                <EventBlockChip item={it} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <HourGrid items={timed} onOpen={onOpen} isToday={isTodayIso(refDate)} />
    </div>
  );
}

/**
 * Single-column timed grid. Lays out events as absolutely-positioned
 * blocks with their top/height computed from start/end. Overlapping
 * events share the column (split-width).
 */
function HourGrid({
  items,
  onOpen,
  isToday,
}: {
  items: CalendarItem[];
  onOpen: (item: CalendarItem) => void;
  isToday: boolean;
}) {
  const hours = useMemo(() => {
    const out: string[] = [];
    for (let h = DAY_GRID_START_HOUR; h < DAY_GRID_END_HOUR; h++) {
      out.push(formatHourLabel(h));
    }
    return out;
  }, []);

  const positioned = useMemo(() => positionEvents(items), [items]);

  return (
    <div className="flex">
      <ul
        aria-hidden="true"
        className="flex w-12 flex-shrink-0 flex-col border-r border-border bg-bg-2 text-right"
      >
        {hours.map((h) => (
          <li
            key={h}
            className="font-mono text-[10px] text-text-3"
            style={{
              height: HOUR_HEIGHT_PX,
              lineHeight: `${HOUR_HEIGHT_PX}px`,
            }}
          >
            <span className="pr-2">{h}</span>
          </li>
        ))}
      </ul>
      <div className="relative flex-1" style={{ height: DAY_GRID_HEIGHT }}>
        {hours.map((_, i) => (
          <div
            key={i}
            className="absolute left-0 right-0 border-t border-border/60"
            style={{ top: i * HOUR_HEIGHT_PX }}
            aria-hidden="true"
          />
        ))}
        {isToday ? <NowLine /> : null}
        {positioned.map((p) => (
          <button
            key={`${p.item.kind}:${p.item.id}`}
            type="button"
            onClick={() => onOpen(p.item)}
            title={p.item.title}
            className={cn(
              "absolute overflow-hidden rounded-sm border px-1.5 py-0.5 text-left text-[11px] shadow-sm",
              p.item.kind === "due"
                ? "border-warning/50 bg-warning-subtle text-warning"
                : "border-info/50 bg-info-subtle text-info",
              "hover:brightness-110",
            )}
            style={{
              top: p.topPx,
              height: Math.max(p.heightPx, 22),
              left: `calc(${(p.col / p.cols) * 100}% + 2px)`,
              width: `calc(${100 / p.cols}% - 4px)`,
            }}
          >
            <span className="block truncate font-mono text-[10px] uppercase tracking-wide opacity-70">
              {p.item.all_day ? "all day" : formatTime(p.item.when)}
            </span>
            <span className="block truncate font-medium">{p.item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface Positioned {
  item: CalendarItem;
  topPx: number;
  heightPx: number;
  col: number;
  cols: number;
}

function positionEvents(items: CalendarItem[]): Positioned[] {
  const sorted = [...items].sort(
    (a, b) =>
      a.when.localeCompare(b.when) || endOf(a).localeCompare(endOf(b)),
  );
  type Working = { item: CalendarItem; startMin: number; endMin: number };
  const work: Working[] = sorted.map((it) => {
    const startMin = minutesIntoDay(it.when);
    const endMin = it.ends_at
      ? minutesIntoDay(it.ends_at)
      : startMin + 30;
    return {
      item: it,
      startMin: Math.max(startMin, DAY_GRID_START_HOUR * 60),
      endMin: Math.min(endMin, DAY_GRID_END_HOUR * 60),
    };
  });

  // Cluster events that touch in time. Within a cluster every event
  // shares the cluster's column count for visual parity.
  const clusters: Working[][] = [];
  for (const w of work) {
    let added = false;
    for (const c of clusters) {
      if (c.some((x) => intersects(x, w))) {
        c.push(w);
        added = true;
        break;
      }
    }
    if (!added) clusters.push([w]);
  }

  const out: Positioned[] = [];
  for (const cluster of clusters) {
    const colEnds: number[] = [];
    const placements = new Map<Working, number>();
    for (const w of cluster) {
      let placed = -1;
      for (let i = 0; i < colEnds.length; i++) {
        if (colEnds[i] <= w.startMin) {
          colEnds[i] = w.endMin;
          placed = i;
          break;
        }
      }
      if (placed === -1) {
        colEnds.push(w.endMin);
        placed = colEnds.length - 1;
      }
      placements.set(w, placed);
    }
    const cols = colEnds.length;
    for (const w of cluster) {
      const startPx =
        (w.startMin / 60 - DAY_GRID_START_HOUR) * HOUR_HEIGHT_PX;
      const heightPx = ((w.endMin - w.startMin) / 60) * HOUR_HEIGHT_PX;
      out.push({
        item: w.item,
        topPx: Math.max(startPx, 0),
        heightPx: Math.max(heightPx, 12),
        col: placements.get(w) ?? 0,
        cols,
      });
    }
  }
  return out;
}

function intersects(
  a: { startMin: number; endMin: number },
  b: { startMin: number; endMin: number },
): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

function minutesIntoDay(iso: string): number {
  // `timestamptz` columns serialize UTC; `new Date(iso).getHours()`
  // re-renders in the browser's local zone so a 9am-Eastern event
  // lands at 9 in the grid regardless of where the server is.
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

function endOf(it: CalendarItem): string {
  if (it.ends_at) return it.ends_at;
  const d = new Date(it.when);
  d.setMinutes(d.getMinutes() + 30);
  return d.toISOString();
}

function NowLine() {
  const now = new Date();
  const min = now.getHours() * 60 + now.getMinutes();
  const top = (min / 60 - DAY_GRID_START_HOUR) * HOUR_HEIGHT_PX;
  if (top < 0 || top > DAY_GRID_HEIGHT) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
      style={{ top }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-danger" />
      <span className="h-px flex-1 bg-danger" />
    </div>
  );
}

function formatHourLabel(h: number): string {
  if (h === 0) return "12 am";
  if (h === 12) return "12 pm";
  if (h < 12) return `${h} am`;
  return `${h - 12} pm`;
}

function isTodayIso(iso: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return iso === today;
}

/* ----------------------------------------------------------------- */
/* Week view — 7-column hour grid                                     */
/* ----------------------------------------------------------------- */

function WeekView({
  items,
  refDate,
  onOpen,
}: {
  items: CalendarItem[];
  refDate: string;
  onOpen: (item: CalendarItem) => void;
}) {
  const days = useMemo(() => buildDayRange(refDate, 7), [refDate]);
  const itemsByDay = useMemo(() => groupByDate(items), [items]);
  const allDayByDay = useMemo(() => {
    const m = new Map<string, CalendarItem[]>();
    for (const d of days) {
      m.set(
        d.date,
        (itemsByDay.get(d.date) ?? []).filter((it) => it.all_day),
      );
    }
    return m;
  }, [days, itemsByDay]);

  return (
    <div className="overflow-hidden rounded border border-border bg-bg-1">
      <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
        <span aria-hidden="true" />
        {days.map((d) => (
          <span
            key={d.date}
            className={cn(
              "px-2 py-1 font-mono",
              d.isToday && "text-accent",
            )}
            title={d.label}
          >
            {d.label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] border-b border-border bg-bg-2/50">
        <span aria-hidden="true" />
        {days.map((d) => {
          const list = allDayByDay.get(d.date) ?? [];
          return (
            <div
              key={d.date}
              className="flex min-h-[24px] flex-wrap gap-1 px-1 py-1"
            >
              {list.map((it) => (
                <EventBlockChip
                  key={`${it.kind}:${it.id}`}
                  item={it}
                  onOpen={onOpen}
                />
              ))}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]">
        <ul aria-hidden="true" className="flex flex-col bg-bg-2 text-right">
          {Array.from({
            length: DAY_GRID_END_HOUR - DAY_GRID_START_HOUR,
          }).map((_, i) => (
            <li
              key={i}
              className="font-mono text-[10px] text-text-3"
              style={{
                height: HOUR_HEIGHT_PX,
                lineHeight: `${HOUR_HEIGHT_PX}px`,
              }}
            >
              <span className="pr-2">
                {formatHourLabel(DAY_GRID_START_HOUR + i)}
              </span>
            </li>
          ))}
        </ul>
        {days.map((d) => {
          const timed = (itemsByDay.get(d.date) ?? []).filter(
            (it) => !it.all_day,
          );
          const positioned = positionEvents(timed);
          return (
            <div
              key={d.date}
              className="relative border-l border-border/60"
              style={{ height: DAY_GRID_HEIGHT }}
            >
              {Array.from({
                length: DAY_GRID_END_HOUR - DAY_GRID_START_HOUR,
              }).map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-border/40"
                  style={{ top: i * HOUR_HEIGHT_PX }}
                  aria-hidden="true"
                />
              ))}
              {d.isToday ? <NowLine /> : null}
              {positioned.map((p) => (
                <button
                  key={`${p.item.kind}:${p.item.id}`}
                  type="button"
                  onClick={() => onOpen(p.item)}
                  title={p.item.title}
                  className={cn(
                    "absolute overflow-hidden rounded-sm border px-1 py-0.5 text-left text-[10px] shadow-sm",
                    p.item.kind === "due"
                      ? "border-warning/50 bg-warning-subtle text-warning"
                      : "border-info/50 bg-info-subtle text-info",
                    "hover:brightness-110",
                  )}
                  style={{
                    top: p.topPx,
                    height: Math.max(p.heightPx, 14),
                    left: `calc(${(p.col / p.cols) * 100}% + 1px)`,
                    width: `calc(${100 / p.cols}% - 2px)`,
                  }}
                >
                  <span className="block truncate font-medium">
                    {p.item.title}
                  </span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Month view — 6×7 grid with positioned chips                        */
/* ----------------------------------------------------------------- */

function MonthView({
  items,
  refDate,
  onOpen,
}: {
  items: CalendarItem[];
  refDate: string;
  onOpen: (item: CalendarItem) => void;
}) {
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
          const list = (itemsByDay.get(cell.date) ?? []).sort(
            (a, b) =>
              Number(b.all_day) - Number(a.all_day) ||
              a.when.localeCompare(b.when),
          );
          const inMonth = cell.month === monthRef.month;
          return (
            <div
              key={cell.date}
              className={cn(
                "flex min-h-[110px] flex-col gap-0.5 border-b border-r border-border/40 p-1 text-[10px]",
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
              {list.slice(0, 4).map((it) => (
                <button
                  key={`${it.kind}:${it.id}`}
                  type="button"
                  onClick={() => onOpen(it)}
                  title={it.title}
                  className={cn(
                    "flex items-center gap-1 truncate rounded-sm px-1 py-0.5 text-left hover:brightness-110",
                    it.kind === "due"
                      ? "bg-warning-subtle text-warning"
                      : "bg-info-subtle text-info",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-1.5 w-1.5 flex-shrink-0 rounded-full",
                      it.kind === "due" ? "bg-warning" : "bg-info",
                    )}
                  />
                  <span className="truncate">
                    {!it.all_day ? (
                      <span className="font-mono opacity-70">
                        {formatTime(it.when)}{" "}
                      </span>
                    ) : null}
                    {it.title}
                  </span>
                </button>
              ))}
              {list.length > 4 ? (
                <span className="text-[10px] text-text-3">
                  +{list.length - 4} more
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
/* Event/task details drawer                                          */
/* ----------------------------------------------------------------- */

/**
 * Right-side slide-in drawer for the selected item. URL-driven via
 * `?selected=<kind>:<id>` so the open state survives reload + back
 * button + deep-link.
 *
 * Two layouts share the chrome:
 *   - "event": full meeting details (time, location, description,
 *     open-in-provider link)
 *   - "due"  : task fragment with a deep-link to the task detail
 *     page for full editing
 */
function DetailsDrawer({
  item,
  onClose,
}: {
  item: CalendarItem;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-30 flex justify-end bg-black/30"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-md flex-col border-l border-border bg-bg-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border bg-bg-2 px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-wide text-text-3">
            {item.kind === "due" ? "Rokki task" : "Calendar event"}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            className="rounded-sm p-1 text-text-3 hover:bg-bg-3 hover:text-text-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="text-base font-semibold text-text-0">{item.title}</h3>
          <DetailMeta item={item} />
          {item.kind === "event" ? (
            <EventBody item={item} />
          ) : (
            <DueBody item={item} />
          )}
        </div>
      </aside>
    </div>
  );
}

function DetailMeta({ item }: { item: CalendarItem }) {
  const start = new Date(item.when);
  const dateLabel = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  let timeLabel: string;
  if (item.all_day) {
    timeLabel = "All day";
  } else if (item.ends_at) {
    timeLabel = `${formatTime(item.when)} – ${formatTime(item.ends_at)}`;
  } else {
    timeLabel = formatTime(item.when);
  }
  return (
    <div className="mt-3 flex flex-col gap-1 text-xs text-text-2">
      <p>
        <span className="font-mono text-[10px] uppercase tracking-wide text-text-3">
          When
        </span>
        <span className="ml-2 text-text-1">
          {dateLabel} · {timeLabel}
        </span>
      </p>
      {item.terminal_slug || item.terminal_ticker ? (
        <p>
          <span className="font-mono text-[10px] uppercase tracking-wide text-text-3">
            Terminal
          </span>
          <span className="ml-2">
            <Link
              href={`/p/${item.terminal_slug ?? item.terminal_ticker}`}
              className="text-accent hover:underline"
            >
              Open terminal
            </Link>
          </span>
        </p>
      ) : null}
    </div>
  );
}

function EventBody({ item }: { item: CalendarItem }) {
  return (
    <div className="mt-4 flex flex-col gap-3 text-sm text-text-1">
      {item.location ? (
        <p className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-text-3" aria-hidden="true" />
          <span>{item.location}</span>
        </p>
      ) : null}
      {item.description ? (
        <div className="whitespace-pre-wrap rounded border border-border bg-bg-0 p-3 text-xs leading-relaxed text-text-1">
          {item.description.length > 2000
            ? `${item.description.slice(0, 2000)}…`
            : item.description}
        </div>
      ) : (
        <p className="text-xs text-text-3">No description.</p>
      )}
      {item.html_link ? (
        <a
          href={item.html_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-accent bg-accent-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent hover:bg-accent/20"
        >
          <ExternalLink className="h-3 w-3" />
          Open in provider
        </a>
      ) : null}
    </div>
  );
}

function DueBody({ item }: { item: CalendarItem }) {
  const segment = item.terminal_slug ?? item.terminal_ticker;
  const href =
    segment && item.ticker_seq != null
      ? `/p/${segment}/task/${item.ticker_seq}`
      : null;
  return (
    <div className="mt-4 flex flex-col gap-3 text-sm text-text-1">
      <p className="text-xs text-text-2">
        Task due {item.all_day ? "today" : "at this time"} — open the task
        detail for editing, comments, subtasks, and assignees.
      </p>
      {href ? (
        <Link
          href={href}
          className="inline-flex w-fit items-center gap-1.5 rounded-sm border border-accent bg-accent-subtle px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-accent hover:bg-accent/20"
        >
          <Repeat className="h-3 w-3" />
          Open task
        </Link>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Block chip used in all-day strip                                   */
/* ----------------------------------------------------------------- */

function EventBlockChip({
  item,
  onOpen,
}: {
  item: CalendarItem;
  onOpen: (item: CalendarItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      title={item.title}
      className={cn(
        "flex max-w-full items-center gap-1 truncate rounded-sm px-1.5 py-0.5 text-[10px] hover:brightness-110",
        item.kind === "due"
          ? "bg-warning-subtle text-warning"
          : "bg-info-subtle text-info",
      )}
    >
      {item.kind === "due" ? (
        <Diamond className="h-2.5 w-2.5 flex-shrink-0" aria-hidden="true" />
      ) : (
        <CalIcon className="h-2.5 w-2.5 flex-shrink-0" aria-hidden="true" />
      )}
      <span className="truncate">{item.title}</span>
    </button>
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
): { date: string; label: string; isToday: boolean }[] {
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
    return {
      date: iso,
      label: isToday ? `Today · ${fmt}` : fmt,
      isToday,
    };
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

function sourceTone(s: CalendarSource): string {
  if (s.kind === "tasks") return "bg-warning";
  return s.provider === "google" ? "bg-info" : "bg-accent";
}
