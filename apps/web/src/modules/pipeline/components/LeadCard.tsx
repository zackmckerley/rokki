"use client";

import { Clock, Flame } from "lucide-react";
import type { LeadRow, PipelineStage } from "@/lib/pipeline/db";
import { isRotting, isFollowUpDue } from "@/lib/pipeline/board";

const PRIORITY_DOT: Record<number, string> = {
  1: "bg-text-3",
  2: "bg-accent",
  3: "bg-danger",
};

/** A draggable lead card in a board column. */
export function LeadCard({
  lead,
  stages,
  nowMs,
  onClick,
  onDragStart,
}: {
  lead: LeadRow;
  stages: PipelineStage[];
  nowMs: number;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const rotting = isRotting(lead, stages, nowMs);
  const due = isFollowUpDue(lead, nowMs);
  const converted = lead.status === "converted";
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      className="flex w-full flex-col gap-1 rounded border border-border bg-bg-1 px-2 py-1.5 text-left hover:border-border-focus"
    >
      <div className="flex items-center gap-1.5">
        {lead.priority > 0 && PRIORITY_DOT[lead.priority] && (
          <span
            className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${PRIORITY_DOT[lead.priority]}`}
            aria-hidden="true"
          />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-0">
          {lead.name}
        </span>
        {converted && (
          <span className="flex-shrink-0 rounded-sm bg-accent/15 px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-accent">
            Terminal
          </span>
        )}
      </div>
      {lead.subtitle && (
        <span className="truncate text-2xs text-text-3">{lead.subtitle}</span>
      )}
      {(lead.source || due || rotting) && (
        <div className="flex flex-wrap items-center gap-1">
          {lead.source && (
            <span className="rounded-sm bg-bg-3 px-1 py-px text-[9px] uppercase tracking-wide text-text-3">
              {lead.source}
            </span>
          )}
          {due && (
            <span className="flex items-center gap-0.5 text-[9px] font-medium text-accent">
              <Clock className="h-2.5 w-2.5" /> Follow up
            </span>
          )}
          {rotting && (
            <span className="flex items-center gap-0.5 text-[9px] font-medium text-danger">
              <Flame className="h-2.5 w-2.5" /> Cold
            </span>
          )}
        </div>
      )}
    </button>
  );
}
