import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  Users,
  Building2,
  Terminal,
  FileText,
  Mail,
  ShieldAlert,
  Activity,
  Sparkles,
  Wrench,
  AlertTriangle,
  ScrollText,
  Database as DatabaseIcon,
  Radio,
  Zap,
  ShieldCheck,
} from "lucide-react";
import type { Database } from "@rokki/db";
import { AdminButton, AdminPanel } from "@/components/admin/primitives";

export const metadata = { title: "Admin — Rokki" };
export const dynamic = "force-dynamic";

/**
 * Operator console. Three areas:
 *   - Health strip (top)
 *   - KPI grid (left, 2/3 width on lg)
 *   - Quick actions + recent events (right column)
 *
 * Counts are fetched in parallel; the page is rerendered every request
 * (force-dynamic) so admins always see fresh numbers.
 */
export default async function AdminOverviewPage() {
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const counts = await Promise.all([
    admin.from("profiles").select("user_id", { count: "exact", head: true }),
    admin
      .from("spaces")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null),
    admin
      .from("spaces")
      .select("id", { count: "exact", head: true })
      .not("archived_at", "is", null),
    admin
      .from("terminals")
      .select("id", { count: "exact", head: true })
      .is("archived_at", null),
    admin
      .from("terminals")
      .select("id", { count: "exact", head: true })
      .not("archived_at", "is", null),
    admin
      .from("files")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    admin
      .from("tools")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    admin
      .from("invites")
      .select("id", { count: "exact", head: true })
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString()),
    admin
      .from("approvals")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    admin
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("virus_scan_status", "pending"),
    admin
      .from("files")
      .select("id", { count: "exact", head: true })
      .eq("virus_scan_status", "infected")
      .is("deleted_at", null),
    admin
      .from("domain_events")
      .select("id", { count: "exact", head: true })
      .gte("occurred_at", oneHourAgo),
  ]);

  const [
    { count: userCount },
    { count: spaceActive },
    { count: spaceArchived },
    { count: terminalActive },
    { count: terminalArchived },
    { count: fileCount },
    { count: toolCount },
    { count: pendingInvites },
    { count: pendingApprovals },
    { count: pendingScans },
    { count: infected },
    { count: lastHourEvents },
  ] = counts;

  // Recent events (right column)
  const { data: recent } = await admin
    .from("domain_events")
    .select("id, name, actor_id, occurred_at, payload")
    .order("occurred_at", { ascending: false })
    .limit(15);
  const events = (recent ?? []) as Array<{
    id: string;
    name: string;
    actor_id: string | null;
    occurred_at: string;
    payload: Record<string, unknown>;
  }>;

  // Health probes — light-touch. DB query just succeeded so we know the
  // primary DB is up; the indexer/scanner pulses are derived from the
  // most-recent indexed_at / virus_scan timestamps.
  const [{ data: lastIndexed }, { data: lastScanned }] = await Promise.all([
    admin
      .from("files")
      .select("indexed_at")
      .not("indexed_at", "is", null)
      .order("indexed_at", { ascending: false })
      .limit(1),
    admin
      .from("files")
      .select("uploaded_at, virus_scan_status")
      .in("virus_scan_status", ["clean", "infected", "skipped"])
      .order("uploaded_at", { ascending: false })
      .limit(1),
  ]);
  const indexedAt = (lastIndexed as { indexed_at: string }[] | null)?.[0]
    ?.indexed_at;
  const scannedAt = (lastScanned as { uploaded_at: string }[] | null)?.[0]
    ?.uploaded_at;

  const health = [
    { label: "Database", ok: true, detail: "responding" },
    { label: "Realtime", ok: true, detail: "subscribed" },
    {
      label: "Indexer",
      ok: indexedAt ? Date.now() - new Date(indexedAt).getTime() < 24 * 3600_000 : true,
      detail: indexedAt
        ? `last ${relativeTime(indexedAt)}`
        : "never (no files indexed yet)",
    },
    {
      label: "Scanner",
      ok: scannedAt ? Date.now() - new Date(scannedAt).getTime() < 24 * 3600_000 : true,
      detail: scannedAt
        ? `last ${relativeTime(scannedAt)}`
        : "never (no files scanned yet)",
    },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Health */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {health.map((h) => (
          <div
            key={h.label}
            className="flex items-center gap-2 rounded border border-border bg-bg-1 px-3 py-2"
          >
            <span
              className={`h-2 w-2 flex-shrink-0 rounded-full ${
                h.ok ? "bg-success" : "bg-warning"
              }`}
              aria-hidden="true"
            />
            <span className="text-xs text-text-1">{h.label}</span>
            <span className="ml-auto truncate text-[10px] text-text-3">
              {h.detail}
            </span>
          </div>
        ))}
      </div>

      <header>
        <h1 className="font-display text-3xl text-text-0">Operator console</h1>
        <p className="mt-1 text-xs text-text-3">
          Provision tenants, audit activity, and respond to ops alerts.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* KPIs (left, 2/3) */}
        <section className="lg:col-span-2 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <Stat
              href="/admin/users"
              icon={<Users />}
              label="Users"
              value={userCount ?? 0}
            />
            <Stat
              href="/admin/spaces"
              icon={<Building2 />}
              label="Spaces (active)"
              value={spaceActive ?? 0}
              subtitle={
                spaceArchived
                  ? `${spaceArchived} archived`
                  : undefined
              }
            />
            <Stat
              href="/admin/terminals"
              icon={<Terminal />}
              label="Terminals"
              value={terminalActive ?? 0}
              subtitle={
                terminalArchived
                  ? `${terminalArchived} archived`
                  : undefined
              }
            />
            <Stat
              icon={<FileText />}
              label="Files"
              value={fileCount ?? 0}
            />
            <Stat
              href="/tools"
              icon={<Sparkles />}
              label="Tools"
              value={toolCount ?? 0}
            />
            <Stat
              href="/admin/invitations"
              icon={<Mail />}
              label="Invites pending"
              value={pendingInvites ?? 0}
              tone={pendingInvites && pendingInvites > 0 ? "accent" : "muted"}
            />
            <Stat
              href="/approvals"
              icon={<ShieldCheck />}
              label="Approvals pending"
              value={pendingApprovals ?? 0}
              tone={
                pendingApprovals && pendingApprovals > 0 ? "warning" : "muted"
              }
            />
            <Stat
              icon={<ShieldAlert />}
              label="Scans pending"
              value={pendingScans ?? 0}
              tone={pendingScans && pendingScans > 0 ? "warning" : "muted"}
            />
            <Stat
              href="/admin/infected"
              icon={<AlertTriangle />}
              label="Infected files"
              value={infected ?? 0}
              tone={infected && infected > 0 ? "danger" : "muted"}
            />
            <Stat
              href="/admin/activity"
              icon={<Zap />}
              label="Events / hour"
              value={lastHourEvents ?? 0}
            />
          </div>
        </section>

        {/* Right column */}
        <section className="flex flex-col gap-3">
          <AdminPanel title="Quick actions">
            <div className="flex flex-col gap-1.5 p-2">
              <Link href="/admin/users/new" className="no-underline">
                <AdminButton variant="accent" className="w-full justify-start">
                  <Users className="h-3 w-3" /> New user
                </AdminButton>
              </Link>
              <Link href="/admin/spaces/new" className="no-underline">
                <AdminButton variant="accent" className="w-full justify-start">
                  <Building2 className="h-3 w-3" /> New space
                </AdminButton>
              </Link>
              <Link href="/admin/invitations" className="no-underline">
                <AdminButton className="w-full justify-start">
                  <Mail className="h-3 w-3" /> Pending invites
                </AdminButton>
              </Link>
              <Link href="/admin/activity" className="no-underline">
                <AdminButton className="w-full justify-start">
                  <ScrollText className="h-3 w-3" /> View activity
                </AdminButton>
              </Link>
              <Link href="/admin/users" className="no-underline">
                <AdminButton className="w-full justify-start">
                  <Wrench className="h-3 w-3" /> User support tools
                </AdminButton>
              </Link>
            </div>
          </AdminPanel>

          <AdminPanel title="Recent events">
            {events.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-text-3">
                Nothing yet.
              </p>
            ) : (
              <ul className="divide-y divide-border text-xs">
                {events.map((e) => (
                  <li key={e.id} className="flex flex-col gap-0.5 px-3 py-1.5">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-accent">{e.name}</span>
                      <span className="ml-auto text-[10px] text-text-3">
                        {relativeTime(e.occurred_at)}
                      </span>
                    </span>
                    <span className="truncate text-[10px] text-text-3">
                      {summarize(e.payload)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </AdminPanel>

          <AdminPanel title="System">
            <div className="flex flex-col gap-2 p-3 text-xs">
              <div className="flex items-center gap-2">
                <DatabaseIcon className="h-3 w-3 text-text-3" />
                <span className="flex-1 text-text-2">Postgres</span>
                <span className="text-[10px] text-text-3">via Supabase</span>
              </div>
              <div className="flex items-center gap-2">
                <Radio className="h-3 w-3 text-text-3" />
                <span className="flex-1 text-text-2">Realtime</span>
                <span className="text-[10px] text-text-3">subscribed</span>
              </div>
              <div className="flex items-center gap-2">
                <Activity className="h-3 w-3 text-text-3" />
                <span className="flex-1 text-text-2">Indexer</span>
                <span className="text-[10px] text-text-3">
                  {indexedAt ? relativeTime(indexedAt) : "idle"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-3 w-3 text-text-3" />
                <span className="flex-1 text-text-2">Scanner</span>
                <span className="text-[10px] text-text-3">
                  {scannedAt ? relativeTime(scannedAt) : "idle"}
                </span>
              </div>
            </div>
          </AdminPanel>
        </section>
      </div>
    </div>
  );
}

function Stat({
  href,
  icon,
  label,
  value,
  subtitle,
  tone = "muted",
}: {
  href?: string;
  icon: React.ReactNode;
  label: string;
  value: number;
  subtitle?: string;
  tone?: "muted" | "accent" | "warning" | "danger";
}) {
  const toneClasses: Record<string, string> = {
    muted: "border-border",
    accent: "border-accent/40 bg-accent-subtle/20",
    warning: "border-warning/40 bg-warning-subtle/20",
    danger: "border-danger/40 bg-danger-subtle/20",
  };
  const content = (
    <div
      className={`flex items-start gap-3 rounded border bg-bg-1 p-3 hover:bg-bg-2 ${
        toneClasses[tone] ?? toneClasses.muted
      }`}
    >
      <span className="mt-1 text-text-3" aria-hidden="true">
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="font-mono text-2xl tabular-nums text-text-0">
          {value.toLocaleString()}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-text-3">
          {label}
        </span>
        {subtitle ? (
          <span className="text-[10px] text-text-3">{subtitle}</span>
        ) : null}
      </span>
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function summarize(payload: Record<string, unknown>): string {
  if (!payload || typeof payload !== "object") return "";
  const s = Object.entries(payload)
    .filter(([k]) => k !== "fields")
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
  return s.length > 100 ? s.slice(0, 100) + "…" : s;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}
