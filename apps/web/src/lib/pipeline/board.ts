/**
 * Pure board logic for the pipeline — grouping leads into stage columns and the
 * "going cold" / "follow-up due" rules. DOM/IO-free so it's unit-tested; the
 * React board consumes these.
 */
import type { LeadRow, PipelineStage, PipelineField } from "./db";

export function defaultStageKey(pipeline: { stages: PipelineStage[] }): string {
  return pipeline.stages[0]?.key ?? "";
}

/**
 * The field the board sums per column for the "value in this stage" rollup —
 * the first currency field on the pipeline (vertical-agnostic; a real-estate
 * pipeline's "Asking" or "Price", a generic one's "Deal value"). Null if none.
 */
export function rollupField(fields: PipelineField[]): PipelineField | null {
  return fields.find((f) => f.type === "currency") ?? null;
}

/** Sum a numeric attribute across leads, ignoring blanks / non-numbers. */
export function sumAttr(leads: Pick<LeadRow, "attributes">[], key: string): number {
  let total = 0;
  for (const l of leads) {
    const raw = (l.attributes as Record<string, unknown>)?.[key];
    const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

/** Compact money label for a column total: $1.2M / $850K / $1,200. */
export function compactMoney(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

export interface StageColumn {
  stage: PipelineStage;
  leads: LeadRow[];
}

/**
 * Group leads into ordered stage columns. A lead whose `stage` isn't in the
 * pipeline (a removed stage) is dropped from the columns — `orphans` collects
 * them so the caller can surface/reassign rather than silently lose them.
 */
export function groupByStage(
  leads: LeadRow[],
  stages: PipelineStage[],
): { columns: StageColumn[]; orphans: LeadRow[] } {
  const columns: StageColumn[] = stages.map((s) => ({ stage: s, leads: [] }));
  const idx = new Map(stages.map((s, i) => [s.key, i]));
  const orphans: LeadRow[] = [];
  for (const lead of leads) {
    const i = idx.get(lead.stage);
    if (i === undefined) orphans.push(lead);
    else columns[i].leads.push(lead);
  }
  return { columns, orphans };
}

/**
 * "Going cold" — an open lead idle in its stage longer than that stage's
 * `rotting_days`. `nowMs` is injected for testability.
 */
export function isRotting(
  lead: Pick<LeadRow, "status" | "stage" | "last_activity_at">,
  stages: PipelineStage[],
  nowMs: number,
): boolean {
  if (lead.status !== "open") return false;
  const stage = stages.find((s) => s.key === lead.stage);
  if (!stage?.rotting_days) return false;
  const last = Date.parse(lead.last_activity_at);
  if (Number.isNaN(last)) return false;
  return nowMs - last > stage.rotting_days * 86_400_000;
}

/** Follow-up due — an open lead whose `next_follow_up_at` is in the past. */
export function isFollowUpDue(
  lead: Pick<LeadRow, "status" | "next_follow_up_at">,
  nowMs: number,
): boolean {
  if (lead.status !== "open" || !lead.next_follow_up_at) return false;
  const due = Date.parse(lead.next_follow_up_at);
  return !Number.isNaN(due) && due <= nowMs;
}
