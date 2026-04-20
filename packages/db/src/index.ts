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
