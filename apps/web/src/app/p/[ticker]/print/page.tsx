import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrintActions } from "./PrintActions";
import type { ProjectStatus, TaskStatus } from "@rokki/db";

interface Props {
  params: Promise<{ ticker: string }>;
}

interface TerminalRow {
  id: string;
  space_id: string;
  ticker: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  type: string;
  created_at: string;
}

interface TaskRow {
  id: string;
  ticker_seq: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
}

interface FileRow {
  id: string;
  filename: string;
  folder: string;
  size_bytes: number;
  uploaded_at: string;
  uploaded_by: string;
}

interface ActivityRow {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_id: string | null;
}

interface MemberRow {
  user_id: string;
  role: string;
  added_at: string;
}

const STATUS_ORDER: TaskStatus[] = ["in_progress", "review", "blocked", "todo", "done"];
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "Review",
  blocked: "Blocked",
  done: "Done",
};

const PRIORITY_LABEL: Record<number, string> = {
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

/**
 * Print-friendly snapshot of a terminal. Two convergent use cases:
 *
 *   1. The user clicks "Print / Export PDF" → opens this page in a new
 *      tab and (optionally) calls window.print() automatically.
 *   2. A future server-side puppeteer/playwright job loads this URL with
 *      the user's session cookie and saves the rendered output as a PDF
 *      via /api/v1/projects/:ticker/export.pdf.
 *
 * Print-clean by construction: no TopBar, no ExplorerRail (hidden via
 * the layout's @media print rule + the always-on print theme below).
 * `[data-print-root="true"]` forces light tokens regardless of theme.
 *
 * Data scope: 30 days for files & activity (recency, page-count
 * control). All tasks are listed because that's the headline content
 * — when a terminal grows past several pages, the printer paginates
 * sensibly thanks to the page-break-inside rules in globals.css.
 */
export default async function TerminalPrintPage({ params }: Props) {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: terminalRow } = await supabase
    .from("terminals")
    .select(
      "id, space_id, ticker, name, description, status, type, created_at",
    )
    .eq("ticker", tickerUpper)
    .is("archived_at", null)
    .maybeSingle();
  if (!terminalRow) notFound();
  const terminal = terminalRow as TerminalRow;

  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();

  const [{ data: tasks }, { data: rawMembers }, { data: files }, { data: activity }, { data: space }] =
    await Promise.all([
      supabase
        .from("tasks")
        .select(
          "id, ticker_seq, title, description, status, priority, due_date, created_at, completed_at",
        )
        .eq("terminal_id", terminal.id)
        .order("status", { ascending: true })
        .order("priority", { ascending: true })
        .order("due_date", { ascending: true, nullsFirst: false }),
      supabase
        .from("terminal_members")
        .select("user_id, role, added_at")
        .eq("terminal_id", terminal.id)
        .order("added_at", { ascending: true }),
      supabase
        .from("files")
        .select("id, filename, folder, size_bytes, uploaded_at, uploaded_by")
        .eq("terminal_id", terminal.id)
        .is("deleted_at", null)
        .gte("uploaded_at", since)
        .order("uploaded_at", { ascending: false })
        .limit(50),
      supabase
        .from("activity")
        .select("id, action, metadata, created_at, actor_id")
        .eq("terminal_id", terminal.id)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(80),
      supabase.from("spaces").select("name, slug").eq("id", terminal.space_id).single(),
    ]);

  const taskRows = (tasks ?? []) as TaskRow[];
  const memberRowsBare = (rawMembers ?? []) as MemberRow[];
  const fileRows = (files ?? []) as FileRow[];
  const activityRows = (activity ?? []) as ActivityRow[];
  const spaceRow = space as { name: string; slug: string } | null;

  // Resolve profile names for members and activity actors in one pass.
  const profileIds = Array.from(
    new Set([
      ...memberRowsBare.map((m) => m.user_id),
      ...activityRows.map((a) => a.actor_id).filter((x): x is string => Boolean(x)),
      ...fileRows.map((f) => f.uploaded_by),
    ]),
  );
  const { data: profiles } = profileIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", profileIds)
    : { data: [] };
  const nameById = new Map(
    ((profiles ?? []) as { user_id: string; full_name: string | null }[]).map(
      (p) => [p.user_id, p.full_name ?? "—"],
    ),
  );

  const groupedTasks = STATUS_ORDER.map((s) => ({
    status: s,
    items: taskRows.filter((t) => t.status === s),
  })).filter((g) => g.items.length > 0);

  const asOf = new Date();

  return (
    <div
      data-print-root="true"
      data-print-keep="true"
      className="mx-auto w-full max-w-4xl bg-bg-1 p-6 text-text-0"
    >
      {/* Header banner — only shown on screen; hidden in print so the
          cover header below is the first thing on page 1. */}
      <PrintActions ticker={terminal.ticker} />

      <header className="border-b-2 border-text-0 pb-4">
        <div className="mb-2 flex items-baseline justify-between font-mono text-xs uppercase tracking-wide text-text-2">
          <span>
            {spaceRow?.name ?? "—"} · {terminal.type}
          </span>
          <span>As of {asOf.toISOString().slice(0, 10)}</span>
        </div>
        <h1 className="font-display text-3xl font-semibold leading-tight text-text-0">
          <span className="font-mono text-base font-bold text-accent">{terminal.ticker}</span>
          <span className="ml-3">{terminal.name}</span>
        </h1>
        {terminal.description ? (
          <p className="mt-2 text-sm text-text-1">{terminal.description}</p>
        ) : null}
        <dl className="mt-3 grid grid-cols-3 gap-x-6 gap-y-1 text-xs text-text-2">
          <Pair label="Status" value={terminal.status} />
          <Pair label="Created" value={terminal.created_at.slice(0, 10)} />
          <Pair label="Members" value={String(memberRowsBare.length)} />
          <Pair label="Tasks" value={String(taskRows.length)} />
          <Pair
            label="Open tasks"
            value={String(taskRows.filter((t) => t.status !== "done").length)}
          />
          <Pair label="Files (30d)" value={String(fileRows.length)} />
        </dl>
      </header>

      {/* Tasks by status group */}
      <section className="mt-6 print-keep-together">
        <h2 className="mb-3 text-lg font-semibold text-text-0">Tasks</h2>
        {groupedTasks.length === 0 ? (
          <p className="text-sm text-text-2">No tasks.</p>
        ) : (
          <div className="space-y-5">
            {groupedTasks.map((g) => (
              <div key={g.status} className="print-keep-together">
                <h3 className="mb-1 border-b border-border pb-1 font-mono text-xs font-semibold uppercase tracking-wide text-text-2">
                  {STATUS_LABEL[g.status]} ({g.items.length})
                </h3>
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="text-left text-text-3">
                      <th className="w-16 py-1 pr-2 font-mono font-normal">#</th>
                      <th className="py-1 pr-2 font-normal">Title</th>
                      <th className="w-20 py-1 pr-2 font-normal">Priority</th>
                      <th className="w-24 py-1 pr-2 font-normal">Due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="py-1 pr-2 font-mono text-text-2">
                          {terminal.ticker}-{t.ticker_seq}
                        </td>
                        <td className="py-1 pr-2 text-text-0">{t.title}</td>
                        <td className="py-1 pr-2 text-text-1">
                          {PRIORITY_LABEL[t.priority] ?? "—"}
                        </td>
                        <td className="py-1 pr-2 font-mono text-text-1">
                          {t.due_date ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Members */}
      <section className="mt-6 print-keep-together">
        <h2 className="mb-3 text-lg font-semibold text-text-0">Members</h2>
        {memberRowsBare.length === 0 ? (
          <p className="text-sm text-text-2">No members.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-text-3">
                <th className="py-1 pr-2 font-normal">Name</th>
                <th className="w-32 py-1 pr-2 font-normal">Role</th>
                <th className="w-32 py-1 pr-2 font-normal">Added</th>
              </tr>
            </thead>
            <tbody>
              {memberRowsBare.map((m) => (
                <tr key={m.user_id} className="border-t border-border">
                  <td className="py-1 pr-2 text-text-0">
                    {nameById.get(m.user_id) ?? "—"}
                  </td>
                  <td className="py-1 pr-2 font-mono uppercase text-text-1">{m.role}</td>
                  <td className="py-1 pr-2 font-mono text-text-2">
                    {m.added_at.slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Recent activity (30 days) */}
      <section className="mt-6 print-keep-together">
        <h2 className="mb-3 text-lg font-semibold text-text-0">
          Recent activity{" "}
          <span className="font-mono text-xs font-normal text-text-3">last 30 days</span>
        </h2>
        {activityRows.length === 0 ? (
          <p className="text-sm text-text-2">No activity in the last 30 days.</p>
        ) : (
          <ul className="divide-y divide-border text-xs">
            {activityRows.map((a) => (
              <li key={a.id} className="flex items-baseline gap-3 py-1">
                <span className="w-32 flex-shrink-0 font-mono text-text-3">
                  {new Date(a.created_at).toISOString().slice(0, 16).replace("T", " ")}
                </span>
                <span className="w-32 flex-shrink-0 truncate text-text-1">
                  {a.actor_id ? nameById.get(a.actor_id) ?? "—" : "system"}
                </span>
                <span className="text-text-1">
                  {humanizeAction(a.action, a.metadata)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Recent files (30 days) */}
      <section className="mt-6 print-keep-together">
        <h2 className="mb-3 text-lg font-semibold text-text-0">
          Recent files{" "}
          <span className="font-mono text-xs font-normal text-text-3">last 30 days</span>
        </h2>
        {fileRows.length === 0 ? (
          <p className="text-sm text-text-2">No files uploaded in the last 30 days.</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-left text-text-3">
                <th className="py-1 pr-2 font-normal">Filename</th>
                <th className="w-32 py-1 pr-2 font-normal">Folder</th>
                <th className="w-20 py-1 pr-2 font-normal">Size</th>
                <th className="w-32 py-1 pr-2 font-normal">Uploaded</th>
                <th className="w-32 py-1 pr-2 font-normal">By</th>
              </tr>
            </thead>
            <tbody>
              {fileRows.map((f) => (
                <tr key={f.id} className="border-t border-border">
                  <td className="py-1 pr-2 text-text-0">{f.filename}</td>
                  <td className="py-1 pr-2 font-mono text-text-2">{f.folder}</td>
                  <td className="py-1 pr-2 font-mono text-text-1">{formatSize(f.size_bytes)}</td>
                  <td className="py-1 pr-2 font-mono text-text-2">
                    {f.uploaded_at.slice(0, 10)}
                  </td>
                  <td className="py-1 pr-2 text-text-1">
                    {nameById.get(f.uploaded_by) ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="mt-8 border-t border-border pt-3 text-[10px] font-mono uppercase tracking-wide text-text-3">
        Rokki · {terminal.ticker} · generated {asOf.toISOString().slice(0, 19).replace("T", " ")}Z
      </footer>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono uppercase text-text-3">{label}</dt>
      <dd className="text-text-0">{value}</dd>
    </div>
  );
}

function humanizeAction(action: string, metadata: Record<string, unknown>): string {
  switch (action) {
    case "terminal.create":
      return "Terminal created";
    case "terminal.update":
      return `Terminal updated${metadata.title ? `: ${metadata.title}` : ""}`;
    case "terminal.archive":
      return "Terminal archived";
    case "task.create":
      return `Task "${metadata.title ?? ""}" created`;
    case "task.complete":
      return `Task completed${metadata.title ? `: ${metadata.title}` : ""}`;
    case "task.update":
      return `Task updated${metadata.title ? `: ${metadata.title}` : ""}`;
    case "task.assign":
      return `Task assigned${metadata.email ? ` to ${metadata.email}` : ""}`;
    case "file.upload":
      return `${metadata.filename ?? "File"} uploaded`;
    case "file.delete":
      return `${metadata.filename ?? "File"} deleted`;
    case "member.invite":
      return `${metadata.email ?? "Someone"} invited`;
    case "member.join":
      return `${metadata.name ?? "Someone"} joined`;
    case "member.remove":
      return `${metadata.name ?? "Someone"} removed`;
    default:
      return action.replace(/\./g, " ");
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}
