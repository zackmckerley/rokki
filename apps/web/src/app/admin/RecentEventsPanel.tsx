"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import {
  AdminFilterInput,
  AdminPanel,
} from "@/components/admin/primitives";
import { EmptyState } from "@/components/EmptyState";

interface EventRow {
  id: string;
  name: string;
  actor_id: string | null;
  actor_name: string | null;
  occurred_at: string;
  payload: Record<string, unknown>;
}

/**
 * Recent events panel, with:
 *   - inline filter (matches against action name + actor name + payload
 *     summary, case-insensitive)
 *   - actor name resolved server-side from profiles, falling back to
 *     short actor_id when the join missed (e.g. system actor)
 *   - each row is a Link to /admin/activity scoped to that action so
 *     operators can drill in
 *   - title attribute exposes the absolute ISO timestamp on hover
 */
export function RecentEventsPanel({ events }: { events: EventRow[] }) {
  const [filter, setFilter] = useState("");
  const filterLower = filter.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!filterLower) return events;
    return events.filter((e) => {
      if (e.name.toLowerCase().includes(filterLower)) return true;
      if (e.actor_name && e.actor_name.toLowerCase().includes(filterLower))
        return true;
      const summary = summarize(e.payload).toLowerCase();
      if (summary.includes(filterLower)) return true;
      return false;
    });
  }, [events, filterLower]);

  return (
    <AdminPanel
      title={
        <span className="flex items-center justify-between gap-2">
          <span>Recent events</span>
          <span className="font-mono text-[9px] text-text-3">
            {filtered.length}
            {filter && filtered.length !== events.length
              ? ` / ${events.length}`
              : ""}
          </span>
        </span>
      }
    >
      <div className="border-b border-border bg-bg-2 px-2 py-1.5">
        <AdminFilterInput
          value={filter}
          onChange={setFilter}
          placeholder="Filter actions, actors, payload…"
          className="w-full"
        />
      </div>
      {filtered.length === 0 ? (
        events.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No recent events."
            body="Activity from across the platform shows up here as it happens."
            className="p-6"
          />
        ) : (
          <p className="p-6 text-center text-xs text-text-3">
            No events match{" "}
            <span className="font-mono text-text-2">
              &ldquo;{filter}&rdquo;
            </span>
            .
          </p>
        )
      ) : (
        <ul className="divide-y divide-border text-xs">
          {filtered.slice(0, 15).map((e) => (
            <li key={e.id}>
              <Link
                href={`/admin/activity?action=${encodeURIComponent(e.name)}${
                  e.actor_id ? `&actor=${encodeURIComponent(e.actor_id)}` : ""
                }`}
                className="flex flex-col gap-0.5 px-3 py-1.5 hover:bg-bg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono text-accent">{e.name}</span>
                  {e.actor_name ? (
                    <span className="text-[10px] text-text-2">
                      · {e.actor_name}
                    </span>
                  ) : e.actor_id ? (
                    <span className="font-mono text-[10px] text-text-3">
                      · {e.actor_id.slice(0, 6)}
                    </span>
                  ) : null}
                  <span
                    className="ml-auto text-[10px] text-text-3"
                    title={e.occurred_at}
                  >
                    {relativeTime(e.occurred_at)}
                  </span>
                </span>
                <span
                  className="truncate text-[10px] text-text-3"
                  title={summarize(e.payload)}
                >
                  {summarize(e.payload) || "—"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

function summarize(payload: Record<string, unknown>): string {
  if (!payload || typeof payload !== "object") return "";
  const s = Object.entries(payload)
    .filter(([k]) => k !== "fields")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  return s.length > 100 ? s.slice(0, 100) + "…" : s;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
