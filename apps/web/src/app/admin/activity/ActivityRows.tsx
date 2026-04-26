"use client";

import { useRef } from "react";
import Link from "next/link";
import { useVirtualList } from "@/lib/use-virtual-list";
import type { ActivityRow } from "./page";

/**
 * Activity-log table body. Plain table render below the threshold;
 * virtualized div-grid above it. We can't virtualize a real <tbody>
 * with absolute positioning (browsers honour table layout instead),
 * so the virtualized branch reproduces the same visual columns with
 * a CSS grid.
 */
const ROW_HEIGHT = 30;
const VIRTUALIZE_THRESHOLD = 200;

export function ActivityRows({ rows }: { rows: ActivityRow[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualize = rows.length > VIRTUALIZE_THRESHOLD;
  const virtual = useVirtualList({
    count: virtualize ? rows.length : 0,
    rowHeight: ROW_HEIGHT,
    scrollRef,
    overscan: 10,
  });

  if (rows.length === 0) {
    return (
      <div className="rounded border border-border bg-bg-1 px-3 py-6 text-center text-xs text-text-3">
        No activity.
      </div>
    );
  }

  if (!virtualize) {
    return (
      <div className="overflow-hidden rounded border border-border bg-bg-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
              <th className="px-3 py-2 text-left font-semibold">When</th>
              <th className="px-3 py-2 text-left font-semibold">Action</th>
              <th className="px-3 py-2 text-left font-semibold">Entity</th>
              <th className="px-3 py-2 text-left font-semibold">Actor</th>
              <th className="px-3 py-2 text-left font-semibold">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <Cells row={r} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Virtualized: a fixed-height scroll viewport, grid rows positioned
  // absolutely. The header is sticky outside the scroll area so it stays
  // visible as the body scrolls. We cap the viewport at 70vh — beyond
  // that the page itself becomes hard to scroll.
  return (
    <div className="overflow-hidden rounded border border-border bg-bg-1">
      <div className="grid grid-cols-[160px_180px_1fr_120px_2fr] border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
        <div className="px-3 py-2 font-semibold">When</div>
        <div className="px-3 py-2 font-semibold">Action</div>
        <div className="px-3 py-2 font-semibold">Entity</div>
        <div className="px-3 py-2 font-semibold">Actor</div>
        <div className="px-3 py-2 font-semibold">Metadata</div>
      </div>
      <div
        ref={scrollRef}
        role="rowgroup"
        className="overflow-y-auto"
        style={{ height: "70vh", maxHeight: "70vh" }}
      >
        <div
          style={{ height: virtual.totalHeight, position: "relative" }}
        >
          {virtual.items.map((vi) => {
            const r = rows[vi.index];
            if (!r) return null;
            return (
              <div
                key={r.id}
                role="row"
                className="grid grid-cols-[160px_180px_1fr_120px_2fr] items-center border-b border-border"
                style={{
                  position: "absolute",
                  top: vi.offset,
                  left: 0,
                  right: 0,
                  height: ROW_HEIGHT,
                }}
              >
                <div className="px-3 font-mono text-[11px] text-text-3">
                  {new Date(r.created_at).toLocaleString()}
                </div>
                <div className="px-3 font-mono text-xs text-accent">
                  {r.action}
                </div>
                <div className="px-3 text-xs text-text-2">
                  {r.entity_type ?? "—"}
                  {r.entity_id ? (
                    <span className="ml-1 font-mono text-[10px] text-text-3">
                      {r.entity_id.slice(0, 8)}
                    </span>
                  ) : null}
                </div>
                <div className="px-3 font-mono text-[10px] text-text-3">
                  {r.actor_id ? (
                    <Link
                      href={`/admin/users/${r.actor_id}`}
                      className="hover:text-accent"
                    >
                      {r.actor_id.slice(0, 8)}
                    </Link>
                  ) : (
                    "system"
                  )}
                </div>
                <div className="truncate px-3 font-mono text-[11px] text-text-3">
                  <code className="truncate">
                    {JSON.stringify(r.metadata).slice(0, 100)}
                  </code>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Cells({ row: r }: { row: ActivityRow }) {
  return (
    <>
      <td className="px-3 py-1.5 font-mono text-[11px] text-text-3">
        {new Date(r.created_at).toLocaleString()}
      </td>
      <td className="px-3 py-1.5 font-mono text-xs text-accent">{r.action}</td>
      <td className="px-3 py-1.5 text-xs text-text-2">
        {r.entity_type ?? "—"}
        {r.entity_id ? (
          <span className="ml-1 font-mono text-[10px] text-text-3">
            {r.entity_id.slice(0, 8)}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-1.5 font-mono text-[10px] text-text-3">
        {r.actor_id ? (
          <Link
            href={`/admin/users/${r.actor_id}`}
            className="hover:text-accent"
          >
            {r.actor_id.slice(0, 8)}
          </Link>
        ) : (
          "system"
        )}
      </td>
      <td className="px-3 py-1.5 font-mono text-[11px] text-text-3">
        <code className="truncate">
          {JSON.stringify(r.metadata).slice(0, 100)}
        </code>
      </td>
    </>
  );
}
