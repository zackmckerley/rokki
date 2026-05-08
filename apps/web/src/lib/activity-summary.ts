/**
 * Single source of truth for turning an `activity` row into the human
 * sentence that surfaces in:
 *
 *   - the dashboard ticker tape ("Recent activity" feed)
 *   - the per-terminal ticker ("$TICKER · activity")
 *   - the notifications bell (when it eventually swaps to driving off
 *     activity rather than a duplicate notifications table)
 *
 * Rules of engagement:
 *
 *   1. The `_updated` plural action variants emitted by the audit
 *      trigger (`tasks_updated`, `terminals_updated`, etc.) are
 *      first-class citizens — Zack flagged "I just want more detail
 *      than 'task updated'", which used to fall through to the
 *      `replace(/[._]/g, ' ')` default and produce that exact garbage.
 *
 *   2. For UPDATE rows with `before_json` + `after_json` set, render
 *      the diff as "field: from → to" for the columns the user
 *      actually cares about (title, status, priority, due_date,
 *      assignees, name). Bag everything else into "+N more changes"
 *      so the chip stays scannable.
 *
 *   3. Fall back to the dotted app-emitted action names where the
 *      caller still uses them (task.create, file.upload, etc.).
 */

export type ActivityMetadata = Record<string, unknown> | null | undefined;
export type ActivityJson = Record<string, unknown> | null | undefined;

export interface ActivityRow {
  action: string;
  metadata?: ActivityMetadata;
  before_json?: ActivityJson;
  after_json?: ActivityJson;
}

/**
 * Maps 1=High, 2=Medium, 3=Low, null=No priority — matches the
 * 2026-05-07 priority redesign.
 */
const PRIORITY_LABEL: Record<number, string> = {
  1: "High",
  2: "Medium",
  3: "Low",
};

const STATUS_LABEL: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  blocked: "Blocked",
  done: "Done",
};

/**
 * Columns that produce a useful, short human delta on update. Any
 * other diffed column rolls up into the "+N more" tail.
 */
const TASK_DIFF_FIELDS: Array<{
  key: string;
  label: string;
  format: (v: unknown) => string;
}> = [
  { key: "title", label: "title", format: (v) => fmtString(v) ?? "—" },
  { key: "status", label: "status", format: (v) => fmtStatus(v) },
  { key: "priority", label: "priority", format: (v) => fmtPriority(v) },
  { key: "due_date", label: "due", format: (v) => fmtString(v) ?? "—" },
  { key: "completed_at", label: "completed", format: (v) => (v ? "yes" : "no") },
  { key: "description", label: "description", format: () => "(text)" },
];

const TERMINAL_DIFF_FIELDS: Array<{
  key: string;
  label: string;
  format: (v: unknown) => string;
}> = [
  { key: "name", label: "name", format: (v) => fmtString(v) ?? "—" },
  { key: "status", label: "status", format: (v) => fmtString(v) ?? "—" },
  {
    key: "description",
    label: "description",
    format: () => "(text)",
  },
];

/**
 * Single entry point. Returns the sentence to render in a chip-sized
 * UI slot — keep it under ~80 chars so we don't overflow the ticker.
 */
export function summarizeActivity(row: ActivityRow): string {
  const action = row.action;
  const m = row.metadata ?? {};
  const pick = (k: string): string | null => {
    const v = m?.[k];
    return typeof v === "string" ? v : null;
  };

  switch (action) {
    case "task.create":
      return `task created: ${pick("title") ?? "(untitled)"}`;
    case "task.complete":
      return `completed: ${pick("title") ?? "(untitled)"}`;
    case "task.delete":
      return `task deleted: ${pick("title") ?? "(untitled)"}`;
    case "task.assigned":
      return `assigned: ${pick("title") ?? "(untitled)"}`;

    case "task.update":
    case "task_updated":
    case "tasks_updated": {
      const after = (row.after_json ?? {}) as Record<string, unknown>;
      const title =
        fmtString(after.title) ?? pick("title") ?? "(untitled)";
      const diffs = describeDiff(
        row.before_json ?? null,
        row.after_json ?? null,
        TASK_DIFF_FIELDS,
      );
      if (!diffs) return `task updated: ${title}`;
      return `${title}: ${diffs}`;
    }

    case "terminal.create":
      return `new terminal: ${pick("name") ?? "(unnamed)"}`;
    case "terminal.archive":
      return `archived ${pick("name") ?? "a terminal"}`;

    case "terminal.update":
    case "terminal_updated":
    case "terminals_updated": {
      const after = (row.after_json ?? {}) as Record<string, unknown>;
      const name = fmtString(after.name) ?? pick("name") ?? "terminal";
      const diffs = describeDiff(
        row.before_json ?? null,
        row.after_json ?? null,
        TERMINAL_DIFF_FIELDS,
      );
      if (!diffs) return `${name} updated`;
      return `${name}: ${diffs}`;
    }

    case "file.upload": {
      const op = pick("op");
      if (op === "folder.create") return `folder: ${pick("path") ?? ""}`;
      if (op === "file.duplicate")
        return `duplicated ${pick("filename") ?? "file"}`;
      return `uploaded ${pick("filename") ?? "a file"}`;
    }
    case "file.update":
    case "file_updated":
    case "files_updated":
      return `file updated: ${pick("filename") ?? ""}`.trim();
    case "file.delete":
      return `deleted ${pick("filename") ?? pick("path") ?? "item"}`;
    case "file.download":
      return `read ${pick("filename") ?? "a file"}`;

    case "comment.create":
      return `commented on ${pick("entity_kind") ?? "a task"}`;
    case "comment.update":
    case "comment_updated":
    case "comments_updated":
      return `comment edited`;

    case "member.invite":
      return `invited ${pick("email") ?? "a member"}`;
    case "member.join":
      return `${pick("name") ?? "someone"} joined`;
    case "member.remove":
      return `removed ${pick("name") ?? "a member"}`;

    case "space.update":
    case "space_updated":
    case "spaces_updated":
      return `space updated: ${pick("name") ?? ""}`.trim();

    case "tool.invoke":
      return `called tool ${pick("slug") ? `"${pick("slug")}"` : ""}`.trim();

    default:
      // Last-resort fallback. NOT seen in practice for any action we
      // emit today, but keeps the ticker from rendering nothing if a
      // future action lands without a case here.
      return action.replace(/[._]/g, " ");
  }
}

/**
 * Format a JSON diff into "field: from → to" segments for the
 * provided field set. Returns `null` when nothing in the field set
 * actually changed.
 *
 * Anything that changed but isn't in the field set gets bundled into
 * a "+N more" tail so the chip stays a one-liner. We deliberately
 * skip boring columns (updated_at, position) so they don't dominate
 * the display.
 */
function describeDiff(
  before: ActivityJson,
  after: ActivityJson,
  fields: Array<{
    key: string;
    label: string;
    format: (v: unknown) => string;
  }>,
): string | null {
  if (!before || !after) return null;
  const segments: string[] = [];
  let extras = 0;
  const trackedKeys = new Set(fields.map((f) => f.key));
  const noiseKeys = new Set([
    "updated_at",
    "created_at",
    "position",
    "ticker_seq",
    "id",
    "metadata",
    "labels", // arrays format poorly in a chip; skip for now
  ]);

  for (const f of fields) {
    const a = (before as Record<string, unknown>)[f.key];
    const b = (after as Record<string, unknown>)[f.key];
    if (jsonEqual(a, b)) continue;
    const from = f.format(a);
    const to = f.format(b);
    segments.push(`${f.label}: ${from} → ${to}`);
  }

  // Tally fields that DID change but aren't in our curated list.
  const allKeys = new Set<string>([
    ...Object.keys(before as object),
    ...Object.keys(after as object),
  ]);
  for (const k of allKeys) {
    if (trackedKeys.has(k) || noiseKeys.has(k)) continue;
    const a = (before as Record<string, unknown>)[k];
    const b = (after as Record<string, unknown>)[k];
    if (!jsonEqual(a, b)) extras += 1;
  }
  if (segments.length === 0 && extras === 0) return null;
  if (extras > 0)
    segments.push(`+${extras} more change${extras === 1 ? "" : "s"}`);
  return segments.join(" · ");
}

function jsonEqual(a: unknown, b: unknown): boolean {
  // Cheap deep equality for the diff use case. The before/after blobs
  // are small (one row), so JSON.stringify is fine; key-order
  // differences are rare since both come from the same `to_jsonb`.
  if (a === b) return true;
  if (a == null && b == null) return true;
  return JSON.stringify(a) === JSON.stringify(b);
}

function fmtString(v: unknown): string | null {
  if (typeof v === "string") return v.length > 60 ? `${v.slice(0, 57)}…` : v;
  return null;
}

function fmtPriority(v: unknown): string {
  if (v == null) return "None";
  if (typeof v === "number" && PRIORITY_LABEL[v]) return PRIORITY_LABEL[v];
  return String(v);
}

function fmtStatus(v: unknown): string {
  if (typeof v === "string" && STATUS_LABEL[v]) return STATUS_LABEL[v];
  if (v == null) return "—";
  return String(v);
}
