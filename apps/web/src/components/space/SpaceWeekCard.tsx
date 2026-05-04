"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Diamond, Calendar as CalIcon } from "lucide-react";
import { DashboardCard } from "@/components/dashboard/DashboardCard";
import { TickerChip } from "@/components/primitives";
import type { SpaceWeekItem } from "@/lib/space-queries";

interface SpaceWeekCardProps {
  items: SpaceWeekItem[];
}

/**
 * Item #5 — space-wide "this week" calendar. Same shape as the
 * dashboard's WeekCard but populated with every task + event
 * across every terminal in the space, not just the personal slice.
 *
 * Defers rendering until mount (same trick as the dashboard
 * WeekCard) because day-key generation uses `new Date()` and
 * `toLocaleDateString`, both of which differ between Vercel UTC
 * and the user's local TZ — that mismatch used to throw React
 * #418.
 */
export function SpaceWeekCard({ items }: SpaceWeekCardProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const grouped = useMemo(() => {
    if (!mounted) return [];
    const days = new Map<string, SpaceWeekItem[]>();
    for (const it of items) {
      const key = it.when.slice(0, 10);
      if (!days.has(key)) days.set(key, []);
      days.get(key)!.push(it);
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const out: { key: string; label: string; items: SpaceWeekItem[] }[] = [];
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
  }, [items, mounted]);

  return (
    <DashboardCard
      title="This week"
      count={items.length}
      expandHref={null}
    >
      {items.length === 0 ? (
        <p className="px-3 py-4 text-center text-[11px] text-text-3">
          Nothing scheduled in the next 7 days.
        </p>
      ) : (
        <ul className="divide-y divide-border/40 text-xs">
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
                <div className="px-3 py-1 text-[11px] text-text-3">—</div>
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

function WeekRow({ item }: { item: SpaceWeekItem }) {
  const href = item.terminal_ticker ? `/p/${item.terminal_ticker}` : undefined;
  const content = (
    <div className="flex items-center gap-2 px-3 py-1 hover:bg-bg-2">
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
      {item.terminal_ticker ? <TickerChip>{item.terminal_ticker}</TickerChip> : null}
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

function formatDayLabel(d: Date, isToday: boolean): string {
  const fmt = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return isToday ? `Today · ${fmt}` : fmt;
}

function formatTime(iso: string): string {
  if (!iso.includes("T")) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
