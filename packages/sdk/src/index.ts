/**
 * @rokki/sdk — official TypeScript client for the Rokki API.
 *
 * Quickstart:
 * ```ts
 * import { createRokkiClient } from "@rokki/sdk";
 * const client = createRokkiClient({
 *   baseUrl: "https://rokki.ai",
 *   apiKey: "rk_live_…",
 * });
 *
 * const { data: tasks } = await client.tasks.list({ terminalTicker: "BRKL" });
 * ```
 *
 * Every method returns `Promise<{ data } | { errors }>` — no exceptions
 * are thrown for normal API errors. Use `isOk` / `isErr` if you prefer
 * type guards.
 */
import { createHttpClient, isErr, isOk, type RokkiClientConfig } from "./http.js";
import {
  buildApprovals,
  buildBriefing,
  buildComments,
  buildFiles,
  buildFolders,
  buildHealth,
  buildMe,
  buildNotifications,
  buildSearch,
  buildSpaces,
  buildTasks,
  buildTerminals,
  buildTools,
  type ApprovalsResource,
  type BriefingResource,
  type CommentsResource,
  type FilesResource,
  type FoldersResource,
  type HealthResource,
  type MeResource,
  type NotificationsResource,
  type SearchResource,
  type SpacesResource,
  type TasksResource,
  type TerminalsResource,
  type ToolsResource,
} from "./resources.js";

export interface RokkiClient {
  health: HealthResource;
  me: MeResource;
  spaces: SpacesResource;
  terminals: TerminalsResource;
  tasks: TasksResource;
  files: FilesResource;
  folders: FoldersResource;
  tools: ToolsResource;
  comments: CommentsResource;
  approvals: ApprovalsResource;
  notifications: NotificationsResource;
  briefing: BriefingResource;
  search: SearchResource;
}

export function createRokkiClient(config: RokkiClientConfig): RokkiClient {
  const http = createHttpClient(config);
  return {
    health: buildHealth(http),
    me: buildMe(http),
    spaces: buildSpaces(http),
    terminals: buildTerminals(http),
    tasks: buildTasks(http),
    files: buildFiles(http),
    folders: buildFolders(http),
    tools: buildTools(http),
    comments: buildComments(http),
    approvals: buildApprovals(http),
    notifications: buildNotifications(http),
    briefing: buildBriefing(http),
    search: buildSearch(http),
  };
}

export { isErr, isOk };
export type { RokkiClientConfig };
export type * from "./types.js";
