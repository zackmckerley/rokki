/**
 * @rokki/db — shared Supabase types.
 *
 * The Database type is generated from the running local DB:
 *   supabase gen types typescript --local > packages/db/src/generated.ts
 *
 * Do not edit `generated.ts` by hand. Regenerate whenever the schema changes.
 * Our own enum aliases below are hand-written for convenience.
 */

export { Constants } from "./generated";
export type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./generated";

// Convenience enum re-exports (match the SQL types).
import type { Database } from "./generated";

export type SpaceRole = Database["public"]["Enums"]["org_role"];
export type TerminalRole = Database["public"]["Enums"]["terminal_role"];
export type TerminalStatus = Database["public"]["Enums"]["project_status"];

// Backwards-compat aliases during the rename — remove once all callers are updated.
export type OrgRole = SpaceRole;
export type ProjectRole = TerminalRole;
export type ProjectStatus = TerminalStatus;
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type FileVisibility = Database["public"]["Enums"]["file_visibility"];
export type VirusScanStatus = Database["public"]["Enums"]["virus_scan_status"];
export type ToolVisibility = Database["public"]["Enums"]["tool_visibility"];
export type ApprovalMode = Database["public"]["Enums"]["approval_mode"];
export type ApprovalStatus = Database["public"]["Enums"]["approval_status"];
export type InvocationStatus = Database["public"]["Enums"]["invocation_status"];
export type TokenScope = Database["public"]["Enums"]["token_scope"];

/**
 * Task priority is stored as SMALLINT (1..4) in the DB so the existing
 * `idx_tasks_priority` partial index and ORDER BY priority queries keep
 * working. The TypeScript layer maps to a friendly enum:
 *   1 = urgent, 2 = high, 3 = medium (default), 4 = low
 */
export type TaskPriority = "urgent" | "high" | "medium" | "low";

export const TASK_PRIORITY_TO_INT: Record<TaskPriority, number> = {
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4,
};

export const TASK_PRIORITY_FROM_INT: Record<number, TaskPriority> = {
  1: "urgent",
  2: "high",
  3: "medium",
  4: "low",
};

export interface TaskRecurrenceRule {
  pattern: "daily" | "weekly" | "monthly";
  interval: number;
  /** Only meaningful for `pattern: "weekly"`; 0 = Sunday … 6 = Saturday. */
  weekdays?: number[];
  /** ISO date (YYYY-MM-DD); recurrence stops after this date. */
  end_date?: string;
}
