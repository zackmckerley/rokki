/**
 * Hand-shaped TypeScript types matching the schemas in the public Rokki
 * OpenAPI document (`apps/web/src/lib/openapi.ts`). Hand-shaped (rather
 * than generated from the JSON spec) because the resulting code is much
 * smaller and avoids a build-time dependency on openapi-typescript.
 *
 * If the spec changes, update both files in the same commit.
 */

export type Uuid = string;
export type IsoDateTime = string;

// ---------------------------------------------------------------------------
// Error envelope
// ---------------------------------------------------------------------------

export type ErrorCode =
  | "invalid_request"
  | "unauthenticated"
  | "forbidden"
  | "quota_exceeded"
  | "approval_required"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "unprocessable"
  | "rate_limited"
  | "internal_error"
  | "upstream_error"
  | "maintenance"
  | "tool_disabled"
  | "tool_pending"
  | "approval_failed";

export interface ApiError {
  code: ErrorCode | string;
  message: string;
  details?: Record<string, unknown> | null;
  retry_after_seconds?: number | null;
}

export interface ErrorResponse {
  errors: ApiError[];
  request_id?: string | null;
}

/** Discriminated union returned by every SDK method. */
export type Result<T> = { data: T } | { errors: ApiError[] };

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

export type TaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "review"
  | "done"
  | "cancelled";

export type ProjectStatus =
  | "planning"
  | "active"
  | "on_hold"
  | "complete"
  | "archived";

export interface Task {
  id: Uuid;
  terminal_id: Uuid;
  ticker_seq?: number;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority?: number;
  due_date?: IsoDateTime | null;
  labels?: string[];
  metadata?: Record<string, unknown>;
  recurrence_rule?: Record<string, unknown> | null;
  recurrence_parent_id?: Uuid | null;
  created_at?: IsoDateTime;
  created_by?: Uuid | null;
  updated_at?: IsoDateTime;
  completed_at?: IsoDateTime | null;
}

export interface TaskCreate {
  title: string;
  description?: string | null;
  priority?: number;
  due_date?: IsoDateTime | null;
  labels?: string[];
  tags?: string[];
  status?: TaskStatus;
  recurrence_rule?: Record<string, unknown> | null;
}

export interface TaskPatch {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: number;
  due_date?: IsoDateTime | null;
  labels?: string[];
  tags?: string[];
  recurrence_rule?: Record<string, unknown> | null;
}

export interface Terminal {
  id: Uuid;
  space_id: Uuid;
  ticker: string;
  name: string;
  description?: string | null;
  type?: string;
  status?: ProjectStatus;
  metadata?: Record<string, unknown>;
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
}

export interface TerminalCreate {
  space_id: Uuid;
  name: string;
  ticker?: string;
  description?: string | null;
  type?: string;
  status?: ProjectStatus;
  metadata?: Record<string, unknown>;
}

export interface TerminalPatch {
  name?: string;
  description?: string | null;
  type?: string;
  status?: ProjectStatus;
  metadata?: Record<string, unknown>;
}

export interface Space {
  id: Uuid;
  slug: string;
  name: string;
  created_at?: IsoDateTime;
}

export interface SpaceMembership {
  role: "owner" | "admin" | "member";
  spaces: Space;
}

export type FileVisibility = "project" | "owners" | "custom";

export type ProjectRole =
  | "owner"
  | "manager"
  | "architect"
  | "gc"
  | "lender"
  | "family"
  | "guest";

export interface FileObject {
  id: Uuid;
  terminal_id: Uuid;
  filename: string;
  folder?: string;
  visibility?: FileVisibility;
  visibility_roles?: ProjectRole[];
  visibility_users?: Uuid[];
  size_bytes?: number | null;
  mime_type?: string | null;
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
  deleted_at?: IsoDateTime | null;
}

export interface FilePatch {
  filename?: string;
  folder?: string;
  visibility?: FileVisibility;
  visibility_roles?: ProjectRole[];
  visibility_users?: Uuid[];
}

export interface Folder {
  id: Uuid;
  terminal_id: Uuid;
  path: string;
  name?: string;
  created_at?: IsoDateTime;
  deleted_at?: IsoDateTime | null;
}

export interface Tool {
  id: Uuid;
  slug: string;
  name: string;
  description?: string;
  visibility?: "public" | "space" | "private";
  owner_user_id?: Uuid | null;
  owner_space_id?: Uuid | null;
  current_version: string;
  tags?: string[];
  timeout_seconds?: number;
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
}

export interface ToolCreate {
  name: string;
  slug?: string;
  description: string;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown> | null;
  code: string;
  timeout_seconds?: number;
  tags?: string[];
}

export interface ToolInvokeInput {
  input?: unknown;
  scripts?: Record<string, string>;
  entrypoint?: string;
}

export interface ToolInvokeResult {
  status: "success" | "error" | "timeout";
  output?: unknown;
  logs: string[];
  duration_ms: number;
  error_message?: string | null;
  error_code?: string | null;
}

export interface ApprovalRequiredResult {
  status: "approval_required";
  approval_id: Uuid;
  message: string;
}

export interface Comment {
  id: Uuid;
  target_type: "task" | "file" | "terminal";
  target_id: Uuid;
  author_id?: Uuid;
  body: string;
  mentions?: Uuid[];
  created_at?: IsoDateTime;
  updated_at?: IsoDateTime;
  deleted_at?: IsoDateTime | null;
}

export interface Approval {
  id: Uuid;
  type: "tool_access" | "tool_invocation";
  requester_id: Uuid;
  approver_space_id: Uuid;
  subject_type: string;
  subject_id: Uuid;
  status: "pending" | "approved" | "denied" | "cancelled";
  context?: Record<string, unknown>;
  created_at?: IsoDateTime;
  decided_at?: IsoDateTime | null;
}

export interface ApiKey {
  id: Uuid;
  provider: string;
  created_at?: IsoDateTime;
  last_used_at?: IsoDateTime | null;
}

export interface AccessToken {
  id: Uuid;
  name?: string;
  scopes?: string[];
  created_at?: IsoDateTime;
  last_used_at?: IsoDateTime | null;
  expires_at?: IsoDateTime | null;
  revoked_at?: IsoDateTime | null;
}

export interface AccessTokenCreated extends AccessToken {
  /** The plaintext rk_live_… or rk_test_… token. Only returned on create. */
  token: string;
}

export interface Notification {
  id: Uuid;
  kind: string;
  title: string;
  body?: string | null;
  target_type?: string | null;
  target_id?: Uuid | null;
  read_at?: IsoDateTime | null;
  created_at?: IsoDateTime;
}

export interface Profile {
  user_id: Uuid;
  email?: string;
  full_name?: string | null;
  avatar_url?: string | null;
  timezone?: string | null;
  settings?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  is_platform_admin?: boolean;
  created_at?: IsoDateTime;
}

export interface ProfilePatch {
  full_name?: string;
  avatar_url?: string | null;
  timezone?: string | null;
  preferences?: Record<string, unknown>;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  version: string;
  time: IsoDateTime;
  checks: Record<string, { ok: boolean; error?: string | null }>;
}

export interface BriefingResponse {
  due_today: number;
  overdue: number;
  next_up: {
    id: Uuid;
    title: string;
    due_date: IsoDateTime | null;
    terminal_id: Uuid;
  } | null;
  [key: string]: unknown;
}

export interface SearchResponse {
  projects: Array<{ id: Uuid; ticker: string; name: string }>;
}
