"use client";

import { useMemo, useState } from "react";
import { Clock } from "lucide-react";
import type { LeadRow, PipelineRow } from "@/lib/pipeline/db";
import { isFollowUpDue, isRotting } from "@/lib/pipeline/board";

const PRIORITY_LABEL: Record<number, string> = { 0: "—", 1: "Low", 2: "Med", 3: "High" };
const select =
  "rounded border border-border bg-bg-2 px-1.5 py-1 text-2xs text-text-2 outline-none focus:border-border-focus";

function attr(lead: LeadRow, key: string): string {
  const v = (lead.attributes as Record<string, unknown>)?.[key];
  return v == null ? "" : String(v);
}
function fmtDate(iso: string | null, nowMs: number): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Show the year only when it differs from "now" so next-year follow-ups read
  // unambiguously without cluttering this-year dates.
  const sameYear = d.getFullYear() === new Date(nowMs).getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Filterable table view of the pipeline — the list alternative to the board.
 *  Self-contained: owns the filter controls + filtering; rows open the lead. */
export function PipelineList({
  leads,
  pipeline,
  nowMs,
  onSelect,
}: {
  leads: LeadRow[];
  pipeline: PipelineRow;
  nowMs: number;
  onSelect: (id: string) => void;
}) {
  const [stageF, setStageF] = useState("all");
  const [statusF, setStatusF] = useState("active"); // active = open + won
  const [sourceF, setSourceF] = useState("all");
  const [prioF, setPrioF] = useState("all");
  const [q, setQ] = useState("");

  const stageLabel = useMemo(
    () => new Map(pipeline.stages.map((s) => [s.key, s.label])),
    [pipeline.stages],
  );
  const sources = useMemo(
    () => Array.from(new Set(leads.map((l) => l.source).filter(Boolean))) as string[],
    [leads],
  );

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return leads
      .filter((l) => {
        if (statusF === "active" && (l.status === "dead" || l.status === "converted"))
          return false;
        if (statusF !== "active" && statusF !== "all" && l.status !== statusF) return false;
        if (stageF !== "all" && l.stage !== stageF) return false;
        if (sourceF !== "all" && l.source !== sourceF) return false;
        if (prioF !== "all" && l.priority !== Number(prioF)) return false;
        if (needle) {
          const hay = [
            l.name,
            l.subtitle ?? "",
            attr(l, "address"),
            attr(l, "city"),
            attr(l, "submarket"),
          ]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Soonest follow-up first (nulls last), then priority.
        const af = a.next_follow_up_at ? Date.parse(a.next_follow_up_at) : Infinity;
        const bf = b.next_follow_up_at ? Date.parse(b.next_follow_up_at) : Infinity;
        if (af !== bf) return af - bf;
        return b.priority - a.priority;
      });
  }, [leads, stageF, statusF, sourceF, prioF, q]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Filters */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-1.5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, address, city…"
          aria-label="Search leads"
          className="min-w-[8rem] flex-1 rounded border border-border bg-bg-2 px-2 py-1 text-2xs text-text-1 placeholder:text-text-3 outline-none focus:border-border-focus"
        />
        <select className={select} value={stageF} onChange={(e) => setStageF(e.target.value)} aria-label="Stage">
          <option value="all">All stages</option>
          {pipeline.stages.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <select className={select} value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Status">
          <option value="active">Active</option>
          <option value="open">Open</option>
          <option value="won">Won</option>
          <option value="dead">Dead</option>
          <option value="converted">Converted</option>
          <option value="all">All</option>
        </select>
        <select className={select} value={prioF} onChange={(e) => setPrioF(e.target.value)} aria-label="Priority">
          <option value="all">Any priority</option>
          <option value="3">High</option>
          <option value="2">Med</option>
          <option value="1">Low</option>
        </select>
        {sources.length > 0 && (
          <select className={select} value={sourceF} onChange={(e) => setSourceF(e.target.value)} aria-label="Source">
            <option value="all">Any source</option>
            {sources.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}
        <span className="font-mono text-2xs text-text-3">{rows.length}</span>
      </div>

      {/* Table */}
      <div className="min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <p className="p-6 text-center text-xs text-text-3">No leads match.</p>
        ) : (
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 bg-bg-1">
              <tr className="border-b border-border/60 text-2xs uppercase tracking-wide text-text-3">
                <th className="px-3 py-1.5 font-semibold">Lead</th>
                <th className="px-2 py-1.5 font-semibold">Stage</th>
                <th className="px-2 py-1.5 font-semibold">Priority</th>
                <th className="hidden px-2 py-1.5 font-semibold sm:table-cell">City</th>
                <th className="hidden px-2 py-1.5 font-semibold md:table-cell">Source</th>
                <th className="px-2 py-1.5 font-semibold">Follow-up</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => {
                const due = isFollowUpDue(l, nowMs);
                const cold = isRotting(l, pipeline.stages, nowMs);
                const city = attr(l, "city") || attr(l, "submarket");
                return (
                  <tr
                    key={l.id}
                    onClick={() => onSelect(l.id)}
                    className="cursor-pointer border-b border-border/30 hover:bg-bg-2"
                  >
                    <td className="px-3 py-1.5">
                      <span className="block truncate font-medium text-text-0" title={l.name}>
                        {l.name}
                      </span>
                      {l.subtitle && (
                        <span className="block truncate text-2xs text-text-3">{l.subtitle}</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-text-2">
                      <span className="rounded-sm bg-bg-3 px-1 py-px text-2xs">
                        {stageLabel.get(l.stage) ?? l.stage}
                      </span>
                      {cold && <span className="ml-1 text-2xs text-danger">cold</span>}
                    </td>
                    <td className="px-2 py-1.5 text-2xs text-text-2">{PRIORITY_LABEL[l.priority]}</td>
                    <td className="hidden px-2 py-1.5 text-2xs text-text-2 sm:table-cell">{city}</td>
                    <td className="hidden px-2 py-1.5 text-2xs text-text-3 md:table-cell">{l.source ?? ""}</td>
                    <td className="px-2 py-1.5 text-2xs">
                      {l.next_follow_up_at ? (
                        <span className={`flex items-center gap-1 ${due ? "text-accent" : "text-text-3"}`}>
                          {due && <Clock className="h-2.5 w-2.5" />}
                          {fmtDate(l.next_follow_up_at, nowMs)}
                        </span>
                      ) : (
                        <span className="text-text-3">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
