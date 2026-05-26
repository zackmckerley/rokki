"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Diamond,
  Calendar as CalIcon,
  Check,
  ChevronDown,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardCard } from "./DashboardCard";
import type {
  WeekItem,
  WeekRange,
  WeekSource,
} from "@/lib/dashboard-queries";

interface WeekCardProps {
  items: WeekItem[];
  /** Calendar sources visible to the viewer — fed to the source filter. */
  sources: WeekSource[];
  /** Active time-window. Default "week". */
  range: WeekRange;
  /** Connection ids the viewer has chosen to hide. */
  hiddenSourceIds: string[];
}

/**
 * Schedule card — calendar events for the chosen range (today, this
 * week, or next 30 days). Filters live in the header:
 *
 *   ┌ SCHEDULE ────── [Today | Week | Month] [Filter ▾] [↗] ┐
 *   │ Mon Aug 12                                              │
 *   │   09:00  Standup        TICKER                          │
 *   │   …                                                     │
 *   └─────────────────────────────────────────────────────────┘
 *
 * State is URL-driven (`?week_range=`, `?week_sources=`) so deep
 * links work and the server re-runs with the narrowed query.
 */
export function WeekCard({
  items,
  sources,
  range,
  hiddenSourceIds,
}: WeekCardProps) {
  // Defer the grouped/rendered content to client mount. The grouping
  // depends on `new Date()` (server's UTC vs. browser's local TZ) and
  // the day/time labels go through toLocaleDateString /
  // toLocaleTimeString, which use the runtime's locale. Both diverge
  // between SSR and CSR — and the divergence used to throw React
  // #418, which detached every event handler in the dashboard
  // subtree (Link clicks silently no-op'd). Rendering only after
  // mount sidesteps the mismatch entirely; the placeholder during
  // SSR is the empty card shell.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const router = useRouter();
  const searchParams = useSearchParams();
  const hiddenSet = useMemo(
    () => new Set(hiddenSourceIds),
    [hiddenSourceIds],
  );

  // Number of day buckets the grouped renderer should produce. Today
  // = 1, week = 7, month = 30 — matches the server-side window so
  // empty days within the window still render with an em-dash.
  const dayCount = range === "today" ? 1 : range === "week" ? 7 : 30;

  const grouped = useMemo(() => {
    if (!mounted) return [];
    const days = new Map<string, WeekItem[]>();
    for (const it of items) {
      const key = it.when.slice(0, 10);
      if (!days.has(key)) days.set(key, []);
      days.get(key)!.push(it);
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const out: { key: string; label: string; items: WeekItem[] }[] = [];
    for (let i = 0; i < dayCount; i++) {
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
  }, [items, mounted, dayCount]);

  /** Push a URL patch — only touches the params this card owns. */
  function patchUrl(patch: {
    range?: WeekRange;
    sources?: string[] | null;
  }) {
    const params = new URLSearchParams(searchParams.toString());
    if (patch.range !== undefined) {
      // "week" is the default — strip it so the URL stays clean.
      if (patch.range === "week") params.delete("week_range");
      else params.set("week_range", patch.range);
    }
    if (patch.sources !== undefined) {
      if (patch.sources == null || patch.sources.length === 0) {
        params.delete("week_sources");
      } else {
        params.set("week_sources", patch.sources.join(","));
      }
    }
    router.push(`/${params.size ? `?${params.toString()}` : ""}`);
  }

  function toggleSource(id: string) {
    const next = new Set(hiddenSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    patchUrl({ sources: Array.from(next) });
  }

  const title = titleFor(range);

  return (
    <DashboardCard
      title={title}
      count={items.length}
      expandHref="/calendar"
      headerRight={
        <div className="flex items-center gap-1.5">
          <RangeToggle
            range={range}
            onSelect={(r) => patchUrl({ range: r })}
          />
          {sources.length > 0 ? (
            <SourceFilter
              sources={sources}
              hidden={hiddenSet}
              onToggle={toggleSource}
            />
          ) : null}
        </div>
      }
    >
      {items.length === 0 ? (
        <EmptyWeek range={range} filtered={hiddenSourceIds.length > 0} />
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

/* ----------------------------------------------------------------- */
/* Range toggle                                                       */
/* ----------------------------------------------------------------- */

function RangeToggle({
  range,
  onSelect,
}: {
  range: WeekRange;
  onSelect: (r: WeekRange) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Time range"
      className="flex overflow-hidden rounded-sm border border-border bg-bg-2"
    >
      {(["today", "week", "month"] as const).map((r, i) => (
        <button
          key={r}
          type="button"
          role="tab"
          aria-selected={range === r}
          onClick={() => onSelect(r)}
          className={cn(
            "px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
            i > 0 && "border-l border-border",
            range === r
              ? "bg-accent text-bg-0"
              : "text-text-2 hover:bg-bg-3 hover:text-text-0",
          )}
        >
          {labelFor(r)}
        </button>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Source filter                                                      */
/* ----------------------------------------------------------------- */

function SourceFilter({
  sources,
  hidden,
  onToggle,
}: {
  sources: WeekSource[];
  hidden: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const visibleCount = sources.length - hidden.size;

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
          "flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
          open
            ? "bg-bg-3 text-text-0"
            : "bg-bg-2 text-text-1 hover:bg-bg-3 hover:text-text-0",
        )}
      >
        <Filter className="h-3 w-3" aria-hidden="true" />
        <span className="hidden sm:inline">Sources</span>
        <span className="rounded-sm bg-bg-3 px-1 font-mono text-[9px] text-text-2">
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
        <div className="absolute right-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-sm border border-border bg-bg-1 shadow-lg">
          <header className="flex items-center justify-between border-b border-border bg-bg-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            <span>Calendars</span>
            <span className="font-mono text-text-2">
              {visibleCount} of {sources.length} shown
            </span>
          </header>
          <ul className="max-h-72 overflow-y-auto py-1 text-xs">
            {sources.map((s) => {
              const isHidden = hidden.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onToggle(s.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-bg-2",
                      isHidden ? "text-text-3" : "text-text-1",
                    )}
                  >
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
                    <span className="flex-1 truncate">{s.label}</span>
                    <span className="font-mono text-[10px] uppercase text-text-3">
                      {s.provider === "google" ? "Google" : "Outlook"}
                    </span>
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
/* Row + empty state                                                  */
/* ----------------------------------------------------------------- */

function WeekRow({ item }: { item: WeekItem }) {
  // Prefer the slug for navigation; fall back to legacy ticker if
  // slug isn't populated (older WeekItems streamed in before the
  // slug migration ran). The route resolver accepts either.
  const href = item.terminal_slug
    ? `/p/${item.terminal_slug}`
    : item.terminal_ticker
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

function EmptyWeek({
  range,
  filtered,
}: {
  range: WeekRange;
  filtered: boolean;
}) {
  const headline = filtered
    ? "No events match this filter."
    : range === "today"
      ? "Nothing scheduled today."
      : range === "week"
        ? "Your week is clear."
        : "Nothing scheduled this month.";
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
      <CalIcon className="h-5 w-5 text-text-3" aria-hidden="true" />
      <p className="text-xs text-text-2">{headline}</p>
      <p className="text-[11px] text-text-3">
        {filtered
          ? "Re-enable a source above to see more."
          : "Calendar events from connected accounts appear here."}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Helpers                                                            */
/* ----------------------------------------------------------------- */

function titleFor(range: WeekRange): string {
  if (range === "today") return "Today";
  if (range === "month") return "Next 30 days";
  return "This week";
}

function labelFor(r: WeekRange): string {
  if (r === "today") return "Today";
  if (r === "week") return "Week";
  return "Month";
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
