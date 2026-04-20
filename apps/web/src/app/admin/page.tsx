import { createClient as createAdminClient } from "@supabase/supabase-js";
import Link from "next/link";
import {
  Users,
  Building2,
  Terminal,
  FileText,
  Activity,
  AlertTriangle,
} from "lucide-react";
import type { Database } from "@rokki/db";

export const metadata = { title: "Admin — Rokki" };
export const dynamic = "force-dynamic";

/**
 * Admin overview. Cheap counts + recent activity. All queries run with
 * the service role (wrapped by the layout's is_platform_admin gate), so
 * RLS doesn't filter anything out.
 */
export default async function AdminOverviewPage() {
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const [
    { count: userCount },
    { count: spaceCount },
    { count: terminalCount },
    { count: fileCount },
    { count: pendingScanCount },
    { count: infectedCount },
    { data: recentEvents },
  ] = await Promise.all([
    admin.from("profiles").select("user_id", { count: "exact", head: true }),
    admin.from("spaces").select("id", { count: "exact", head: true }),
    admin
      .from("terminals")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null),
    admin
      .from("files")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    admin
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("virus_scan_status", "pending"),
    admin
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("virus_scan_status", "infected"),
    admin
      .from("domain_events")
      .select("id, name, actor_id, occurred_at, payload")
      .order("occurred_at", { ascending: false })
      .limit(10),
  ]);

  const events = (recentEvents ?? []) as Array<{
    id: string;
    name: string;
    actor_id: string | null;
    occurred_at: string;
    payload: Record<string, unknown>;
  }>;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold text-text-0">Overview</h1>
        <p className="mt-1 text-xs text-text-3">
          Platform-wide metrics. Read-only — click through for per-entity actions.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          href="/admin/users"
          icon={<Users className="h-4 w-4 text-accent" />}
          label="Users"
          value={userCount ?? 0}
        />
        <Stat
          href="/admin/spaces"
          icon={<Building2 className="h-4 w-4 text-accent" />}
          label="Spaces"
          value={spaceCount ?? 0}
        />
        <Stat
          href="/admin/terminals"
          icon={<Terminal className="h-4 w-4 text-accent" />}
          label="Terminals"
          value={terminalCount ?? 0}
        />
        <Stat
          icon={<FileText className="h-4 w-4 text-accent" />}
          label="Files"
          value={fileCount ?? 0}
        />
      </section>

      {infectedCount && infectedCount > 0 ? (
        <aside className="flex items-start gap-3 rounded border border-danger/40 bg-danger-subtle px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger" />
          <div className="flex-1 text-sm">
            <p className="text-danger">
              {infectedCount} file{infectedCount === 1 ? "" : "s"} flagged by virus
              scanning.
            </p>
            <Link href="/admin/infected" className="text-xs text-danger/80 underline">
              Review
            </Link>
          </div>
        </aside>
      ) : null}

      {pendingScanCount && pendingScanCount > 0 ? (
        <aside className="flex items-start gap-3 rounded border border-warning/40 bg-warning-subtle px-4 py-3 text-sm text-warning">
          <Activity className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            {pendingScanCount} file{pendingScanCount === 1 ? "" : "s"} awaiting
            virus scan. Check that the indexer + ClamAV are running.
          </span>
        </aside>
      ) : null}

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-text-0">
          <Activity className="h-4 w-4 text-text-3" />
          Recent domain events
        </h2>
        {events.length === 0 ? (
          <p className="rounded border border-dashed border-border bg-bg-1 p-6 text-center text-xs text-text-3">
            No events yet. Events appear here as users create spaces, terminals,
            tasks, and files.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded border border-border bg-bg-1">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex items-center gap-3 px-4 py-2 text-xs"
              >
                <span className="font-mono text-accent">{e.name}</span>
                <span className="flex-1 truncate text-text-3">
                  {summarize(e.payload)}
                </span>
                <span className="text-text-3">
                  {new Date(e.occurred_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-text-3">
          Full audit log at{" "}
          <Link href="/admin/activity" className="underline hover:text-text-1">
            /admin/activity
          </Link>
          .
        </p>
      </section>
    </div>
  );
}

function Stat({
  href,
  icon,
  label,
  value,
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  const content = (
    <div className="flex items-start gap-3 rounded border border-border bg-bg-1 p-3 hover:bg-bg-2">
      <span className="mt-0.5">{icon}</span>
      <span className="flex flex-col">
        <span className="text-2xl font-semibold tabular-nums text-text-0">
          {value.toLocaleString()}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-text-3">
          {label}
        </span>
      </span>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function summarize(payload: Record<string, unknown>): string {
  if (!payload || typeof payload !== "object") return "";
  // Keep it to 120 chars — the row is dense.
  const s = Object.entries(payload)
    .filter(([k]) => k !== "fields")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  return s.length > 120 ? s.slice(0, 120) + "…" : s;
}
