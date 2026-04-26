/**
 * One method per OpenAPI operation, grouped by resource. Each method
 * forwards to the shared `RokkiHttpClient` and returns
 * `Promise<Result<T>>`.
 *
 * Naming conventions:
 *   - List endpoints  → `list(opts?)`
 *   - Single fetches  → `get(id, opts?)`
 *   - Mutations       → `create / update / delete / archive / invoke / etc.`
 *
 * The shapes here intentionally mirror `apps/web/src/lib/openapi.ts`. Add
 * a method here whenever you add a public route — and update both files
 * in the same commit.
 */
import type {
  AccessToken,
  AccessTokenCreated,
  ApiKey,
  Approval,
  ApprovalRequiredResult,
  BriefingResponse,
  Comment,
  FileObject,
  FilePatch,
  Folder,
  HealthResponse,
  Notification,
  Profile,
  ProfilePatch,
  Result,
  SearchResponse,
  Space,
  SpaceMembership,
  Task,
  TaskCreate,
  TaskPatch,
  Terminal,
  TerminalCreate,
  TerminalPatch,
  Tool,
  ToolCreate,
  ToolInvokeInput,
  ToolInvokeResult,
  Uuid,
} from "./types.js";
import type { RokkiHttpClient } from "./http.js";

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export interface HealthResource {
  check(): Promise<Result<HealthResponse>>;
}

export function buildHealth(http: RokkiHttpClient): HealthResource {
  return {
    check: () => http.request<HealthResponse>("GET", "/api/v1/health"),
  };
}

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------

export interface MeResource {
  get(): Promise<Result<Profile>>;
  update(patch: ProfilePatch): Promise<Result<void>>;
  listTokens(): Promise<Result<AccessToken[]>>;
  createToken(args: {
    name: string;
    scopes?: string[];
    expires_at?: string | null;
  }): Promise<Result<AccessTokenCreated>>;
  revokeToken(id: Uuid): Promise<Result<void>>;
  listApiKeys(): Promise<Result<ApiKey[]>>;
  setApiKey(args: { provider: string; key: string }): Promise<Result<ApiKey>>;
  deleteApiKey(id: Uuid): Promise<Result<void>>;
}

export function buildMe(http: RokkiHttpClient): MeResource {
  return {
    get: () => http.request<Profile>("GET", "/api/v1/me"),
    update: (patch) => http.request<void>("PATCH", "/api/v1/me", { body: patch }),
    listTokens: () => http.request<AccessToken[]>("GET", "/api/v1/me/tokens"),
    createToken: (args) =>
      http.request<AccessTokenCreated>("POST", "/api/v1/me/tokens", {
        body: args,
      }),
    revokeToken: (id) =>
      http.request<void>("DELETE", `/api/v1/me/tokens/${encodeURIComponent(id)}`),
    listApiKeys: () => http.request<ApiKey[]>("GET", "/api/v1/me/api-keys"),
    setApiKey: (args) =>
      http.request<ApiKey>("POST", "/api/v1/me/api-keys", { body: args }),
    deleteApiKey: (id) =>
      http.request<void>("DELETE", `/api/v1/me/api-keys/${encodeURIComponent(id)}`),
  };
}

// ---------------------------------------------------------------------------
// Spaces (a.k.a. orgs in the URL space)
// ---------------------------------------------------------------------------

export interface SpacesResource {
  list(): Promise<Result<SpaceMembership[]>>;
  create(args: { slug: string; name: string }): Promise<Result<Space>>;
  get(slug: string): Promise<Result<Space>>;
  update(slug: string, patch: { name?: string }): Promise<Result<Space>>;
  listMembers(
    slug: string,
  ): Promise<Result<Array<{ user_id: Uuid; role: "owner" | "admin" | "member" }>>>;
  addMember(
    slug: string,
    args: { email: string; role?: "owner" | "admin" | "member" },
  ): Promise<Result<SpaceMembership>>;
  setMemberRole(
    slug: string,
    userId: Uuid,
    args: { role: "owner" | "admin" | "member" },
  ): Promise<Result<void>>;
  removeMember(slug: string, userId: Uuid): Promise<Result<void>>;
}

export function buildSpaces(http: RokkiHttpClient): SpacesResource {
  return {
    list: () => http.request<SpaceMembership[]>("GET", "/api/v1/orgs"),
    create: (args) => http.request<Space>("POST", "/api/v1/orgs", { body: args }),
    get: (slug) =>
      http.request<Space>("GET", `/api/v1/orgs/${encodeURIComponent(slug)}`),
    update: (slug, patch) =>
      http.request<Space>("PATCH", `/api/v1/orgs/${encodeURIComponent(slug)}`, {
        body: patch,
      }),
    listMembers: (slug) =>
      http.request("GET", `/api/v1/orgs/${encodeURIComponent(slug)}/members`),
    addMember: (slug, args) =>
      http.request<SpaceMembership>(
        "POST",
        `/api/v1/orgs/${encodeURIComponent(slug)}/members`,
        { body: args },
      ),
    setMemberRole: (slug, userId, args) =>
      http.request<void>(
        "PATCH",
        `/api/v1/orgs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
        { body: args },
      ),
    removeMember: (slug, userId) =>
      http.request<void>(
        "DELETE",
        `/api/v1/orgs/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`,
      ),
  };
}

// ---------------------------------------------------------------------------
// Terminals (URL: /projects)
// ---------------------------------------------------------------------------

export interface TerminalsResource {
  list(): Promise<Result<Terminal[]>>;
  create(args: TerminalCreate): Promise<Result<Terminal>>;
  get(ticker: string): Promise<Result<Terminal>>;
  update(ticker: string, patch: TerminalPatch): Promise<Result<Terminal>>;
  archive(ticker: string): Promise<Result<void>>;
}

export function buildTerminals(http: RokkiHttpClient): TerminalsResource {
  return {
    list: () => http.request<Terminal[]>("GET", "/api/v1/projects"),
    create: (args) =>
      http.request<Terminal>("POST", "/api/v1/projects", { body: args }),
    get: (ticker) =>
      http.request<Terminal>(
        "GET",
        `/api/v1/projects/${encodeURIComponent(ticker)}`,
      ),
    update: (ticker, patch) =>
      http.request<Terminal>(
        "PATCH",
        `/api/v1/projects/${encodeURIComponent(ticker)}`,
        { body: patch },
      ),
    archive: (ticker) =>
      http.request<void>(
        "DELETE",
        `/api/v1/projects/${encodeURIComponent(ticker)}`,
      ),
  };
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface TasksResource {
  /**
   * List tasks in a terminal. Pass either `terminalId` (uuid) or
   * `terminalTicker` (e.g. "BRKL"); ticker uses the terminal-scoped
   * route which is what most callers want.
   */
  list(args: {
    terminalTicker: string;
    status?: Task["status"];
  }): Promise<Result<Task[]>>;
  create(args: { terminalTicker: string } & TaskCreate): Promise<Result<Task>>;
  get(id: Uuid): Promise<Result<Task>>;
  getBySeq(args: { ticker: string; seq: number }): Promise<Result<Task>>;
  update(id: Uuid, patch: TaskPatch): Promise<Result<Task>>;
  delete(id: Uuid): Promise<Result<void>>;
  complete(id: Uuid): Promise<Result<Task>>;
  addAssignee(id: Uuid, userId: Uuid): Promise<Result<void>>;
  removeAssignee(id: Uuid, userId: Uuid): Promise<Result<void>>;
  listComments(taskId: Uuid): Promise<Result<Comment[]>>;
  addComment(taskId: Uuid, body: string): Promise<Result<Comment>>;
}

export function buildTasks(http: RokkiHttpClient): TasksResource {
  return {
    list: ({ terminalTicker, status }) =>
      http.request<Task[]>(
        "GET",
        `/api/v1/projects/${encodeURIComponent(terminalTicker)}/tasks`,
        { query: { status } },
      ),
    create: ({ terminalTicker, ...body }) =>
      http.request<Task>(
        "POST",
        `/api/v1/projects/${encodeURIComponent(terminalTicker)}/tasks`,
        { body },
      ),
    get: (id) => http.request<Task>("GET", `/api/v1/tasks/${encodeURIComponent(id)}`),
    getBySeq: ({ ticker, seq }) =>
      http.request<Task>(
        "GET",
        `/api/v1/tasks/by-seq/${encodeURIComponent(ticker)}/${encodeURIComponent(String(seq))}`,
      ),
    update: (id, patch) =>
      http.request<Task>("PATCH", `/api/v1/tasks/${encodeURIComponent(id)}`, {
        body: patch,
      }),
    delete: (id) =>
      http.request<void>("DELETE", `/api/v1/tasks/${encodeURIComponent(id)}`),
    complete: (id) =>
      http.request<Task>("POST", `/api/v1/tasks/${encodeURIComponent(id)}/complete`),
    addAssignee: (id, userId) =>
      http.request<void>(
        "POST",
        `/api/v1/tasks/${encodeURIComponent(id)}/assignees`,
        { body: { user_id: userId } },
      ),
    removeAssignee: (id, userId) =>
      http.request<void>(
        "DELETE",
        `/api/v1/tasks/${encodeURIComponent(id)}/assignees`,
        { query: { user_id: userId } },
      ),
    listComments: (id) =>
      http.request<Comment[]>(
        "GET",
        `/api/v1/tasks/${encodeURIComponent(id)}/comments`,
      ),
    addComment: (id, body) =>
      http.request<Comment>(
        "POST",
        `/api/v1/tasks/${encodeURIComponent(id)}/comments`,
        { body: { body } },
      ),
  };
}

// ---------------------------------------------------------------------------
// Files / Folders
// ---------------------------------------------------------------------------

export interface FilesResource {
  list(args: { terminalTicker: string }): Promise<Result<FileObject[]>>;
  /**
   * Upload via multipart/form-data. Caller supplies a `File` (browser) or
   * a `Blob` (node18+) plus optional folder & visibility.
   */
  upload(args: {
    terminalTicker: string;
    file: Blob;
    filename?: string;
    folder?: string;
    visibility?: FileObject["visibility"];
  }): Promise<Result<FileObject>>;
  update(id: Uuid, patch: FilePatch): Promise<Result<FileObject>>;
  delete(id: Uuid): Promise<Result<void>>;
  duplicate(id: Uuid): Promise<Result<FileObject>>;
  restore(id: Uuid): Promise<Result<FileObject>>;
  permanentDelete(id: Uuid): Promise<Result<void>>;
  signedUrl(id: Uuid): Promise<Result<{ url: string; expires_at: string }>>;
}

export function buildFiles(http: RokkiHttpClient): FilesResource {
  return {
    list: ({ terminalTicker }) =>
      http.request<FileObject[]>(
        "GET",
        `/api/v1/projects/${encodeURIComponent(terminalTicker)}/files`,
      ),
    upload: ({ terminalTicker, file, filename, folder, visibility }) => {
      const fd = new FormData();
      if (filename) fd.append("file", file, filename);
      else fd.append("file", file);
      if (folder) fd.append("folder", folder);
      if (visibility) fd.append("visibility", visibility);
      return http.request<FileObject>(
        "POST",
        `/api/v1/projects/${encodeURIComponent(terminalTicker)}/files`,
        { body: fd },
      );
    },
    update: (id, patch) =>
      http.request<FileObject>(
        "PATCH",
        `/api/v1/files/${encodeURIComponent(id)}`,
        { body: patch },
      ),
    delete: (id) =>
      http.request<void>("DELETE", `/api/v1/files/${encodeURIComponent(id)}`),
    duplicate: (id) =>
      http.request<FileObject>(
        "POST",
        `/api/v1/files/${encodeURIComponent(id)}/duplicate`,
      ),
    restore: (id) =>
      http.request<FileObject>(
        "POST",
        `/api/v1/files/${encodeURIComponent(id)}/restore`,
      ),
    permanentDelete: (id) =>
      http.request<void>(
        "DELETE",
        `/api/v1/files/${encodeURIComponent(id)}/permanent`,
      ),
    signedUrl: (id) =>
      http.request<{ url: string; expires_at: string }>(
        "GET",
        `/api/v1/files/${encodeURIComponent(id)}/signed-url`,
      ),
  };
}

export interface FoldersResource {
  list(args: { terminalTicker: string }): Promise<Result<Folder[]>>;
  create(args: {
    terminalTicker: string;
    path: string;
  }): Promise<Result<Folder>>;
  update(
    id: Uuid,
    patch: { path?: string; name?: string },
  ): Promise<Result<Folder>>;
  delete(id: Uuid): Promise<Result<void>>;
  duplicate(id: Uuid): Promise<Result<Folder>>;
}

export function buildFolders(http: RokkiHttpClient): FoldersResource {
  return {
    list: ({ terminalTicker }) =>
      http.request<Folder[]>(
        "GET",
        `/api/v1/projects/${encodeURIComponent(terminalTicker)}/folders`,
      ),
    create: ({ terminalTicker, path }) =>
      http.request<Folder>(
        "POST",
        `/api/v1/projects/${encodeURIComponent(terminalTicker)}/folders`,
        { body: { path } },
      ),
    update: (id, patch) =>
      http.request<Folder>(
        "PATCH",
        `/api/v1/folders/${encodeURIComponent(id)}`,
        { body: patch },
      ),
    delete: (id) =>
      http.request<void>("DELETE", `/api/v1/folders/${encodeURIComponent(id)}`),
    duplicate: (id) =>
      http.request<Folder>(
        "POST",
        `/api/v1/folders/${encodeURIComponent(id)}/duplicate`,
      ),
  };
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface ToolsResource {
  list(): Promise<Result<Tool[]>>;
  create(args: ToolCreate): Promise<Result<{ id: Uuid; slug: string }>>;
  get(slug: string): Promise<Result<Tool>>;
  update(
    slug: string,
    patch: {
      name?: string;
      description?: string;
      tags?: string[];
      visibility?: Tool["visibility"];
    },
  ): Promise<Result<Tool>>;
  delete(slug: string): Promise<Result<void>>;
  invoke(
    slug: string,
    args: ToolInvokeInput,
  ): Promise<Result<ToolInvokeResult | ApprovalRequiredResult>>;
}

export function buildTools(http: RokkiHttpClient): ToolsResource {
  return {
    list: () => http.request<Tool[]>("GET", "/api/v1/tools"),
    create: (args) =>
      http.request<{ id: Uuid; slug: string }>("POST", "/api/v1/tools", {
        body: args,
      }),
    get: (slug) =>
      http.request<Tool>("GET", `/api/v1/tools/${encodeURIComponent(slug)}`),
    update: (slug, patch) =>
      http.request<Tool>("PATCH", `/api/v1/tools/${encodeURIComponent(slug)}`, {
        body: patch,
      }),
    delete: (slug) =>
      http.request<void>("DELETE", `/api/v1/tools/${encodeURIComponent(slug)}`),
    invoke: (slug, args) =>
      http.request<ToolInvokeResult | ApprovalRequiredResult>(
        "POST",
        `/api/v1/tools/${encodeURIComponent(slug)}/invoke`,
        { body: args },
      ),
  };
}

// ---------------------------------------------------------------------------
// Comments (generic)
// ---------------------------------------------------------------------------

export interface CommentsResource {
  list(args: {
    target_type: "task" | "file" | "terminal";
    target_id: Uuid;
  }): Promise<Result<Comment[]>>;
  create(args: {
    target_type: "task" | "file" | "terminal";
    target_id: Uuid;
    body: string;
  }): Promise<Result<Comment>>;
  update(id: Uuid, body: string): Promise<Result<Comment>>;
  delete(id: Uuid): Promise<Result<void>>;
}

export function buildComments(http: RokkiHttpClient): CommentsResource {
  return {
    list: ({ target_type, target_id }) =>
      http.request<Comment[]>("GET", "/api/v1/comments", {
        query: { target_type, target_id },
      }),
    create: (args) =>
      http.request<Comment>("POST", "/api/v1/comments", { body: args }),
    update: (id, body) =>
      http.request<Comment>("PATCH", `/api/v1/comments/${encodeURIComponent(id)}`, {
        body: { body },
      }),
    delete: (id) =>
      http.request<void>("DELETE", `/api/v1/comments/${encodeURIComponent(id)}`),
  };
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export interface ApprovalsResource {
  list(): Promise<Result<Approval[]>>;
  decide(
    id: Uuid,
    args: { status: "approved" | "denied"; reason?: string | null },
  ): Promise<Result<Approval>>;
}

export function buildApprovals(http: RokkiHttpClient): ApprovalsResource {
  return {
    list: () => http.request<Approval[]>("GET", "/api/v1/approvals"),
    decide: (id, args) =>
      http.request<Approval>(
        "PATCH",
        `/api/v1/approvals/${encodeURIComponent(id)}`,
        { body: args },
      ),
  };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationsResource {
  list(): Promise<Result<Notification[]>>;
  markRead(args: { ids?: Uuid[]; all?: boolean }): Promise<Result<void>>;
}

export function buildNotifications(http: RokkiHttpClient): NotificationsResource {
  return {
    list: () => http.request<Notification[]>("GET", "/api/v1/notifications"),
    markRead: (args) =>
      http.request<void>("PATCH", "/api/v1/notifications", { body: args }),
  };
}

// ---------------------------------------------------------------------------
// Briefing / Search
// ---------------------------------------------------------------------------

export interface BriefingResource {
  get(): Promise<Result<BriefingResponse>>;
}

export function buildBriefing(http: RokkiHttpClient): BriefingResource {
  return {
    get: () => http.request<BriefingResponse>("GET", "/api/v1/briefing"),
  };
}

export interface SearchResource {
  query(): Promise<Result<SearchResponse>>;
}

export function buildSearch(http: RokkiHttpClient): SearchResource {
  return {
    query: () => http.request<SearchResponse>("GET", "/api/v1/search"),
  };
}
