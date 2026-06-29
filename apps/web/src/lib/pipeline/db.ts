/**
 * Typed Row interfaces for the pipeline tables + a loosely-typed client accessor
 * (same `any`-boundary convention as `marketsDb()`/`contactsDb()`; removed once
 * the generated types include `pl_*` / `terminal_contacts`).
 */

export interface PipelineStage {
  key: string;
  label: string;
  color?: string;
  /** open ⇒ in-funnel; won/lost ⇒ a terminal outcome column. */
  type: "open" | "won" | "lost";
  /** Idle longer than this ⇒ the lead is flagged "going cold". */
  rotting_days?: number;
  /** Reaching this stage promotes the lead to a Terminal. */
  is_terminal_gate?: boolean;
}

export type PipelineFieldType =
  | "text"
  | "number"
  | "currency"
  | "select"
  | "date"
  | "address"
  | "url";

export interface PipelineField {
  key: string;
  label: string;
  type: PipelineFieldType;
  options?: string[];
  /** Section the field renders under in the lead form (e.g. "Location"). */
  group?: string;
}

export interface PipelineRow {
  id: string;
  space_id: string;
  name: string;
  kind: string;
  stages: PipelineStage[];
  fields: PipelineField[];
  /** True once the user has edited `fields` — stops template field-sync. */
  fields_customized: boolean;
  position: number;
  created_by: string | null;
  created_at: string;
}

export type LeadStatus = "open" | "won" | "lost" | "dead" | "converted";

export interface LeadRow {
  id: string;
  pipeline_id: string;
  space_id: string;
  name: string;
  subtitle: string | null;
  stage: string;
  status: LeadStatus;
  priority: number;
  source: string | null;
  owner_id: string | null;
  next_follow_up_at: string | null;
  last_activity_at: string;
  promoted_terminal_id: string | null;
  dead_reason: string | null;
  lat: number | null;
  lng: number | null;
  attributes: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadContactRow {
  lead_id: string;
  contact_id: string;
  role: string | null;
  added_at: string;
}

/** Lean columns for the board/table cards. */
export const LEAD_LIST_COLUMNS =
  "id, pipeline_id, name, subtitle, stage, status, priority, source, " +
  "next_follow_up_at, last_activity_at, promoted_terminal_id, attributes, updated_at";

export type PipelineClient = any;

export function pipelineDb(client: unknown): PipelineClient {
  return client as PipelineClient;
}
