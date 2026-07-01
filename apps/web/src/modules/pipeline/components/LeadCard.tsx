"use client";

import { useState } from "react";
import { Clock, Flame, Layers, StickyNote } from "lucide-react";
import type { LeadRow, PipelineStage, PipelineField } from "@/lib/pipeline/db";
import {
  isRotting,
  isFollowUpDue,
  compactMoney,
  daysSince,
  CARD_FIELD_CAP,
} from "@/lib/pipeline/board";

const PRIORITY_DOT: Record<number, string> = {
  1: "bg-text-3",
  2: "bg-accent",
  3: "bg-danger",
};

/** A field's display value for a card chip (formatted by type); null if empty. */
function cardFieldValue(lead: LeadRow, f: PipelineField): string | null {
  const raw = (lead.attributes as Record<string, unknown>)?.[f.key];
  if (raw == null || String(raw).trim() === "") return null;
  if (f.type === "currency") {
    const n = Number(raw);
    return Number.isFinite(n) ? compactMoney(n) || String(raw) : String(raw);
  }
  return String(raw);
}

/** Count of non-empty parcels on a lead (an assemblage has >1). */
function parcelCount(lead: LeadRow): number {
  const p = (lead.attributes as Record<string, unknown>)?.parcels;
  return Array.isArray(p) ? p.length : 0;
}
/** Whether the lead has any notes text. */
function hasNotes(lead: LeadRow): boolean {
  const n = (lead.attributes as Record<string, unknown>)?.notes;
  return typeof n === "string" && n.trim().length > 0;
}

/** A draggable lead card in a board column. */
export function LeadCard({
  lead,
  stages,
  nowMs,
  cardFields = [],
  onClick,
  onDragStart,
}: {
  lead: LeadRow;
  stages: PipelineStage[];
  nowMs: number;
  /** Pipeline fields flagged "show on card" (parent passes pipeline.fields). */
  cardFields?: PipelineField[];
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const rotting = isRotting(lead, stages, nowMs);
  const due = isFollowUpDue(lead, nowMs);
  const converted = lead.status === "converted";
  const parcels = parcelCount(lead);
  const notes = hasNotes(lead);
  // Days since last activity — a lightweight "aging" cue on every card. Hidden
  // when the lead is already flagged Cold (that flame says the same thing) or
  // when it's fresh (< 1 day).
  const age = daysSince(lead.last_activity_at, nowMs);
  const showAge = age >= 1 && !rotting;
  const [dragging, setDragging] = useState(false);

  // Up to CARD_FIELD_CAP non-empty card fields, formatted. Keyed by the field's
  // unique key (labels can collide).
  const chips = cardFields
    .filter((f) => f.card)
    .map((f) => ({ key: f.key, label: f.label, value: cardFieldValue(lead, f) }))
    .filter((c): c is { key: string; label: string; value: string } => c.value != null)
    .slice(0, CARD_FIELD_CAP);
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        setDragging(true);
        onDragStart(e);
      }}
      onDragEnd={() => setDragging(false)}
      onClick={onClick}
      className={`flex w-full flex-col gap-1 rounded border border-border bg-bg-1 px-2 py-1.5 text-left hover:border-border-focus ${
        dragging ? "opacity-50 ring-1 ring-border-focus" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        {lead.priority > 0 && PRIORITY_DOT[lead.priority] && (
          <span
            className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${PRIORITY_DOT[lead.priority]}`}
            aria-hidden="true"
          />
        )}
        <span
          className="min-w-0 flex-1 truncate text-xs font-medium text-text-0"
          title={lead.name}
        >
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
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {chips.map((c) => (
            <span
              key={c.key}
              title={c.label}
              className="max-w-[8rem] truncate rounded-sm bg-bg-2 px-1 py-px font-mono text-[9px] text-text-2"
            >
              {c.value}
            </span>
          ))}
        </div>
      )}
      {(lead.source || due || rotting || parcels > 1 || notes || showAge) && (
        <div className="flex flex-wrap items-center gap-1">
          {lead.source && (
            <span className="rounded-sm bg-bg-3 px-1 py-px text-[9px] uppercase tracking-wide text-text-3">
              {lead.source}
            </span>
          )}
          {showAge && (
            <span
              className="flex items-center gap-0.5 text-[9px] text-text-3"
              title={`${age} day${age === 1 ? "" : "s"} since last activity`}
            >
              <Clock className="h-2.5 w-2.5" /> {age}d
            </span>
          )}
          {parcels > 1 && (
            <span
              className="flex items-center gap-0.5 text-[9px] text-text-3"
              title={`Assemblage — ${parcels} parcels`}
            >
              <Layers className="h-2.5 w-2.5" /> {parcels}
            </span>
          )}
          {notes && (
            <StickyNote className="h-2.5 w-2.5 text-text-3" aria-label="Has notes" />
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
