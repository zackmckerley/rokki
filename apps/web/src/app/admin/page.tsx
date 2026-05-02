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
  Inbox,
} from "lucide-react";
import type { Database } from "@rokki/db";
import {
  AdminButton,
  AdminPanel,
  AdminSectionHeader,
} from "@/components/admin/primitives";
import { EmptyState } from "@/components/EmptyState";
import { RecentEventsPanel } from "./RecentEventsPanel";
import { RefreshButton } from "./RefreshButton";

export const metadata = { title: "Admin — Rokki" };
export const dynamic = "force-dynamic";

/**
 * Operator console. Three areas:
 *   - Header with as-of timestamp + manual refresh
 *   - KPI grid (left, 2/3 width on lg)
 *   - Quick actions + recent events + system panel (right column)
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
  const renderedAt = new Date().toISOString();

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
      .from("activity")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneHourAgo),
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

  // Pull recent events + the actor profile names in parallel so we can
  // render "<actor> · <action>" instead of just the action verb.
  const { data: recent } = await admin
    .from("activity")
    .select("id, action, actor_id, created_at, metadata")
    .order("created_at", { ascending: false })
    .limit(30);
  const eventRows = ((recent ?? []) as Array<{
    id: string;
    action: string;
    actor_id: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
  }>);
  const actorIds = Array.from(
    new Set(eventRows.map((r) => r.actor_id).filter((id): id is string => !!id)),
  );
  const actorNamesById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, full_name")
      .in("user_id", actorIds);
    for (const p of (profiles ?? []) as Array<{
      user_id: string;
      full_name: string | null;
    }>) {
      if (p.full_name) actorNamesById.set(p.user_id, p.full_name);
    }
  }
  const events = eventRows.map((r) => ({
    id: r.id,
    name: r.action,
    actor_id: r.actor_id,
    actor_name: r.actor_id ? actorNamesById.get(r.actor_id) ?? null : null,
    occurred_at: r.created_at,
    payload: r.metadata ?? {},
  }));

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

  return (
    <div className="flex flex-col gap-5">
      <AdminSectionHeader
        title="Operator console"
        description={
          <>
            Provision tenants, audit activity, and respond to ops alerts.
            Refreshed{" "}
            <time dateTime={renderedAt} title={renderedAt}>
              {formatTime(renderedAt)}
            </time>
            .
          </>
        }
        actions={<RefreshButton />}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* KPIs (left, 2/3) */}
        <section className="lg:col-span-2 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <Stat
              href="/admin/users"
              icon={<Users className="h-4 w-4" />}
              label="Users"
              value={userCount ?? 0}
            />
            <Stat
              href="/admin/spaces"
              icon={<Building2 className="h-4 w-4" />}
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
              icon={<Terminal className="h-4 w-4" />}
              label="Terminals"
              value={terminalActive ?? 0}
              subtitle={
                terminalArchived
                  ? `${terminalArchived} archived`
                  : undefined
              }
            />
            <Stat
              href="/admin/storage"
              icon={<FileText className="h-4 w-4" />}
              label="Files"
              value={fileCount ?? 0}
            />
            <Stat
              href="/admin/tools"
              icon={<Sparkles className="h-4 w-4" />}
              label="Tools"
              value={toolCount ?? 0}
            />
            <Stat
              href="/admin/invitations"
              icon={<Mail className="h-4 w-4" />}
              label="Invites pending"
              value={pendingInvites ?? 0}
              tone={pendingInvites && pendingInvites > 0 ? "accent" : "muted"}
            />
            <Stat
              href="/approvals"
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Approvals pending"
              value={pendingApprovals ?? 0}
              tone={
                pendingApprovals && pendingApprovals > 0 ? "warning" : "muted"
              }
            />
            <Stat
              href="/admin/storage"
              icon={<ShieldAlert className="h-4 w-4" />}
              label="Scans pending"
              value={pendingScans ?? 0}
              tone={pendingScans && pendingScans > 0 ? "warning" : "muted"}
            />
            <Stat
              href="/admin/infected"
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Infected files"
              value={infected ?? 0}
              // Infected count is sticky-danger: any positive number
              // stays red until cleared, even if the page just re-rendered
              // and the cell looks "fresh". Operators never want this to
              // wash out into a muted color.
              tone={(infected ?? 0) > 0 ? "danger" : "muted"}
            />
            <Stat
              href="/admin/activity"
              icon={<Zap className="h-4 w-4" />}
              label="Activity / hour"
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

          <RecentEventsPanel events={events} />

          <AdminPanel
            title={
              <span className="flex items-center justify-between">
                <span>System</span>
                <Link
                  href="/admin/health"
                  className="font-mono text-[9px] uppercase tracking-wide text-text-3 hover:text-text-1"
                >
                  detail →
                </Link>
              </span>
            }
          >
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
                <span
                  className="text-[10px] text-text-3"
                  title={indexedAt ?? undefined}
                >
                  {indexedAt ? relativeTime(indexedAt) : "idle"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-3 w-3 text-text-3" />
                <span className="flex-1 text-text-2">Scanner</span>
                <span
                  className="text-[10px] text-text-3"
                  title={scannedAt ?? undefined}
                >
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

/**
 * Stat tile with a tone-coded left border. Tone tints are deliberately
 * stronger than they were before — the previous bg-tone-subtle/20
 * background was so faint that warning/danger tiles looked like every
 * other tile. The 2px tone-colored left border is the primary signal;
 * the tinted background is secondary support.
 */
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
    accent:
      "border-l-2 border-l-accent border-y border-r border-border bg-accent-subtle/30",
    warning:
      "border-l-2 border-l-warning border-y border-r border-border bg-warning-subtle/30",
    danger:
      "border-l-2 border-l-danger border-y border-r border-border bg-danger-subtle/40",
  };
  const iconTone: Record<string, string> = {
    muted: "text-text-3",
    accent: "text-accent",
    warning: "text-warning",
    danger: "text-danger",
  };
  const content = (
    <div
      className={`flex items-start gap-3 rounded ${
        tone === "muted" ? "border" : ""
      } bg-bg-1 p-3 hover:bg-bg-2 ${toneClasses[tone] ?? toneClasses.muted}`}
    >
      <span className={`mt-0.5 ${iconTone[tone] ?? iconTone.muted}`} aria-hidden="true">
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="font-mono text-xl tabular-nums text-text-0">
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
  return href ? (
    <Link
      href={href}
      className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
    >
      {content}
    </Link>
  ) : (
    content
  );
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

function formatTime(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    })
    .toLowerCase()
    .replace(/\s/g, "");
}
