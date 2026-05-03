import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckSquare, Settings, Users } from "lucide-react";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { ProjectTerminal } from "@/components/ProjectTerminal";
import { TerminalPresence } from "@/components/dashboard/TerminalPresence";
import { ExplorerRail } from "@/components/dashboard/ExplorerRail";
import {
  loadDashSpaces,
  loadDashTerminals,
} from "@/lib/dashboard-queries";
import { CORE_MODULE_CARDS, SPACE_TAGLINE } from "@/lib/project-templates";
import type { ProjectStatus } from "@rokki/db";

interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * Per-page title + share-card metadata.
 *
 * Image scrapers (Slack, iMessage, Twitter, etc.) hit this without a
 * session, so we look up the terminal name with the service-role client
 * read-only. Falls back gracefully to just the ticker if the env vars
 * aren't set or the lookup fails.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let displayName = tickerUpper;
  if (url && serviceKey) {
    try {
      const admin = createAdminClient<Database>(url, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data } = await admin
        .from("terminals")
        .select("name")
        .eq("ticker", tickerUpper)
        .is("archived_at", null)
        .maybeSingle();
      const row = data as { name: string } | null;
      if (row?.name) displayName = row.name;
    } catch {
      // fall through with the ticker as the name
    }
  }

  const title = `${tickerUpper} · ${displayName} — Rokki`;
  const description =
    displayName === tickerUpper
      ? `Rokki terminal ${tickerUpper}.`
      : `${displayName} on Rokki — terminal ${tickerUpper}.`;

  return {
    title,
    description,
    openGraph: {
      siteName: "Rokki",
      title,
      description,
      type: "website",
      // The per-page opengraph-image.tsx is automatically picked up; we
      // list it explicitly so previews built by tools that don't run
      // the file convention still resolve the correct asset.
      images: [`/p/${ticker}/opengraph-image`],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`/p/${ticker}/opengraph-image`],
    },
  };
}

interface ProjectRow {
  id: string;
  space_id: string;
  ticker: string;
  name: string;
  description: string | null;
  type: string;
  status: ProjectStatus;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ActivityRow {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface MemberRow {
  role: string;
  user_id: string;
  profiles: { full_name: string | null } | null;
}

export default async function ProjectTerminalPage({ params }: Props) {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: project } = await supabase
    .from("terminals")
    .select(
      "id, space_id, ticker, name, description, type, status, metadata, created_at",
    )
    .eq("ticker", tickerUpper)
    .is("archived_at", null)
    .maybeSingle();

  if (!project) notFound();
  const p = project as ProjectRow;

  const [
    { data: activity },
    { data: rawMembers },
    { data: org },
    { data: callerProfile },
    explorerSpaces,
    explorerTerminals,
    toolsResult,
  ] = await Promise.all([
    supabase
      .from("activity")
      .select("id, action, metadata, created_at")
      .eq("terminal_id", p.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("terminal_members")
      .select("user_id, role")
      .eq("terminal_id", p.id),
    supabase.from("spaces").select("slug, name").eq("id", p.space_id).single(),
    supabase
      .from("profiles")
      .select("full_name, is_platform_admin")
      .eq("user_id", user.id)
      .maybeSingle(),
    // ExplorerRail data — was being fetched in the layout, now the
    // page owns it so the rail can be passed through the shell and
    // rendered below the topbar (instead of beside it as an aside).
    loadDashSpaces(supabase, user.id),
    loadDashTerminals(supabase),
    supabase
      .from("tools")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
  ]);

  const activities = (activity ?? []) as ActivityRow[];
  const bareMembers =
    (rawMembers ?? []) as { user_id: string; role: string }[];
  const orgData = org as { slug: string; name: string } | null;

  // Join profiles client-side (no FK from project_members → profiles in schema).
  const userIds = bareMembers.map((m) => m.user_id);
  const { data: profileRows } = userIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds)
    : { data: [] };
  const profileMap = new Map(
    ((profileRows ?? []) as { user_id: string; full_name: string | null }[]).map(
      (p2) => [p2.user_id, p2],
    ),
  );
  const memberRows: MemberRow[] = bareMembers.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    profiles: profileMap.get(m.user_id)
      ? { full_name: profileMap.get(m.user_id)?.full_name ?? null }
      : null,
  }));

  const callerMembership = memberRows.find((m) => m.user_id === user.id);
  const isOwnerOrManager =
    callerMembership?.role === "owner" || callerMembership?.role === "manager";

  const callerProfileTyped = callerProfile as
    | { full_name: string | null; is_platform_admin: boolean }
    | null;
  const callerName =
    callerProfileTyped?.full_name ??
    user.email?.split("@")[0] ??
    "—";
  const isPlatformAdmin = Boolean(callerProfileTyped?.is_platform_admin);

  const tickerItems = activities.map((a) => ({
    id: a.id,
    text: humanizeAction(a.action, a.metadata),
    when: relativeTime(a.created_at),
  }));

  return (
    <ProjectTerminal
      topBar={
        <TopBar>
          <span className="text-text-3">/</span>
          {orgData ? (
            <Link href="/" className="text-text-1 hover:text-text-0">
              {orgData.name}
            </Link>
          ) : null}
          <span className="text-text-3">/</span>
          <span className="text-text-0 font-medium">{p.name}</span>
          {/* Subtle settings cog right after the terminal name —
              contextual access to per-terminal admin (rename, members,
              archive) without re-introducing the redundant top-right
              "Settings" link. The big top-right link was the
              clutter; this small inline cog reads as "settings for
              the thing the breadcrumb just named." */}
          <Link
            href={`/p/${p.ticker}/settings`}
            aria-label={`${p.name} settings`}
            title="Terminal settings"
            className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <Settings className="h-3 w-3" aria-hidden="true" />
          </Link>
          <span className="ml-auto flex items-center gap-3">
            <TerminalPresence
              terminalId={p.id}
              userId={user.id}
              fullName={callerName}
            />
          </span>
        </TopBar>
      }
      ticker={p.ticker}
      project={{
        id: p.id,
        name: p.name,
        ticker: p.ticker,
        status: p.status,
        type: p.type,
      }}
      tickerItems={tickerItems}
      isOwnerOrManager={isOwnerOrManager}
      overviewLeft={<OverviewLeft project={p} members={memberRows} />}
      overviewMain={<OverviewMain project={p} />}
      rightPane={<AIChatStub project={p} />}
      leftRail={
        <ExplorerRail
          spaces={explorerSpaces}
          terminals={explorerTerminals}
          toolCount={toolsResult.count ?? 0}
          userName={callerName}
          userEmail={user.email ?? ""}
          isPlatformAdmin={isPlatformAdmin}
        />
      }
    />
  );
}

function OverviewLeft({
  project,
  members,
}: {
  project: ProjectRow;
  members: MemberRow[];
}) {
  return (
    <div className="space-y-6 p-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-3">
          Status
        </h3>
        <div className="space-y-2 text-sm">
          <Row label="Status" value={<StatusPill status={project.status} />} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-3">
          Team ({members.length})
        </h3>
        <ul className="space-y-1.5 text-sm">
          {members.slice(0, 5).map((m, i) => (
            <li key={i} className="flex items-center justify-between">
              <span className="text-text-1">{m.profiles?.full_name ?? "—"}</span>
              <span className="font-mono text-xs uppercase text-text-3">
                {m.role}
              </span>
            </li>
          ))}
          {members.length === 0 ? (
            <li className="text-xs text-text-3">No members yet.</li>
          ) : null}
          {members.length > 5 ? (
            <li className="text-xs text-text-3">
              +{members.length - 5} more · press F4
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function OverviewMain({ project }: { project: ProjectRow }) {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-text-0">{project.name}</h1>
        <p className="mt-1 text-sm text-text-2">
          {project.description ?? SPACE_TAGLINE}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {CORE_MODULE_CARDS.map((m) => (
          <div
            key={m.name}
            className="flex items-center gap-3 rounded border border-border bg-bg-1 px-3 py-3"
          >
            <span className="text-accent">
              {m.icon === "CheckSquare" ? (
                <CheckSquare className="h-3.5 w-3.5" />
              ) : (
                <Users className="h-3.5 w-3.5" />
              )}
            </span>
            <p className="text-sm font-medium text-text-1">{m.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIChatStub({ project }: { project: ProjectRow }) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-text-0">Ask {project.ticker}</h3>
        <p className="text-xs text-text-3">Project-scoped AI · coming soon</p>
      </div>
      <div className="flex-1 p-4 text-sm text-text-3">
        Connect your Claude or ChatGPT via MCP (settings) to chat with this
        space&apos;s data.
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs uppercase tracking-wide text-text-3">{label}</span>
      {value}
    </div>
  );
}

function StatusPill({ status }: { status: ProjectStatus }) {
  const classes: Record<ProjectStatus, string> = {
    planning: "bg-bg-3 text-text-2",
    active: "bg-success-subtle text-success",
    blocked: "bg-danger-subtle text-danger",
    done: "bg-bg-3 text-text-2",
    archived: "bg-bg-3 text-text-3",
  };
  return (
    <span
      className={`rounded-sm px-2 py-0.5 font-mono text-xs uppercase ${classes[status]}`}
    >
      {status}
    </span>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function humanizeAction(action: string, metadata: Record<string, unknown>): string {
  switch (action) {
    case "terminal.create":
      return `Space created`;
    case "terminal.update":
      return `Space updated`;
    case "task.create":
      return `Task "${metadata.title ?? ""}" created`;
    case "task.complete":
      return `Task completed`;
    case "file.upload":
      return `${metadata.filename ?? "File"} uploaded`;
    case "member.invite":
      return `${metadata.email ?? "Someone"} invited`;
    case "member.join":
      return `${metadata.name ?? "Someone"} joined`;
    default:
      return action.replace(/\./g, " ");
  }
}
