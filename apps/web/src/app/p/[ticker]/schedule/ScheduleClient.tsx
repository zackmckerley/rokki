"use client";

import { useMemo, useState } from "react";
import { Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PhaseRow {
  id: string;
  title: string;
  start_date: string; // yyyy-mm-dd
  end_date: string;
  color: string | null;
  depends_on: string | null;
  position: number;
  created_at: string;
}

/**
 * Lightweight Gantt-style view. Each phase is a bar proportionally
 * positioned across the min-max date range. No drag-to-resize yet —
 * future slice — but dates are editable inline.
 */
export function ScheduleClient({
  ticker,
  initial,
}: {
  ticker: string;
  initial: PhaseRow[];
}) {
  const [rows, setRows] = useState<PhaseRow[]>(initial);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { min, max } = useMemo(() => {
    if (rows.length === 0) return { min: null, max: null };
    const starts = rows.map((r) => new Date(r.start_date).getTime());
    const ends = rows.map((r) => new Date(r.end_date).getTime());
    return {
      min: Math.min(...starts),
      max: Math.max(...ends),
    };
  }, [rows]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/v1/projects/${ticker}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title,
          start_date: startDate,
          end_date: endDate,
        }),
      });
      if (!r.ok) {
        const b = (await r.json().catch(() => ({}))) as {
          errors?: { message: string }[];
        };
        setError(b.errors?.[0]?.message ?? `HTTP ${r.status}`);
        return;
      }
      const b = (await r.json()) as { data: PhaseRow };
      setRows((prev) => [...prev, b.data]);
      setTitle("");
      setStartDate("");
      setEndDate("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text-0">
          {rows.length} phase{rows.length === 1 ? "" : "s"}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent-subtle px-2.5 py-1 text-xs font-semibold uppercase text-accent hover:bg-accent/20"
        >
          <Plus className="h-3 w-3" /> {open ? "Cancel" : "New phase"}
        </button>
      </div>

      {open ? (
        <form
          onSubmit={add}
          className="mb-4 grid grid-cols-1 gap-2 rounded border border-border bg-bg-1 p-3 md:grid-cols-3"
        >
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Phase title"
            className="md:col-span-3 rounded-sm border border-border bg-bg-0 px-2 py-1 text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <input
            required
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <input
            required
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-sm border border-border bg-bg-0 px-2 py-1 font-mono text-sm text-text-0 outline-none focus:border-border-focus"
          />
          <div className="flex items-center justify-end gap-2">
            {error ? (
              <span className="text-xs text-danger">{error}</span>
            ) : null}
            <button
              type="submit"
              disabled={saving}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-sm border border-accent bg-accent px-3 py-1 text-xs font-semibold uppercase text-bg-0 hover:bg-accent-hover",
                saving && "cursor-not-allowed opacity-60",
              )}
            >
              <Check className="h-3 w-3" /> {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      ) : null}

      {rows.length === 0 ? (
        <p className="rounded border border-dashed border-border bg-bg-1 p-8 text-center text-xs text-text-3">
          No phases yet. Add one above to start the Gantt.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-border bg-bg-1">
          <div className="min-w-[640px]">
            {/* Header: date span */}
            <header className="flex items-center border-b border-border bg-bg-2 px-3 py-1.5 text-[10px] font-mono text-text-3">
              <span className="w-48 shrink-0">Phase</span>
              <span className="flex-1 flex justify-between">
                <span>{min ? fmt(new Date(min)) : ""}</span>
                <span>{max ? fmt(new Date(max)) : ""}</span>
              </span>
            </header>
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <span className="w-48 shrink-0 truncate text-text-0">
                    {r.title}
                  </span>
                  <span className="relative h-5 flex-1">
                    {min !== null && max !== null ? (
                      <span
                        className="absolute inset-y-0 rounded-sm bg-accent-subtle/80 border border-accent/50"
                        style={positionOf(r, min, max)}
                      />
                    ) : null}
                    <span className="absolute inset-y-0 left-0 right-0 flex items-center justify-between px-1 font-mono text-[10px] text-text-3">
                      <span>{r.start_date}</span>
                      <span>{r.end_date}</span>
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function positionOf(
  r: PhaseRow,
  min: number,
  max: number,
): React.CSSProperties {
  const span = Math.max(max - min, 86_400_000);
  const start = new Date(r.start_date).getTime();
  const end = new Date(r.end_date).getTime();
  const leftPct = ((start - min) / span) * 100;
  const widthPct = Math.max(((end - start) / span) * 100, 1);
  return { left: `${leftPct}%`, width: `${widthPct}%` };
}

function fmt(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
  });
}
