import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/TopBar";
import { SettingsHistorySection } from "@/components/SettingsHistorySection";
import { TerminalSettingsForm } from "./TerminalSettingsForm";
import type { ProjectStatus, ProjectRole } from "@rokki/db";

interface Props {
  params: Promise<{ ticker: string }>;
}

/**
 * Per-terminal settings — rename, status, archive, members & roles.
 *
 * Access:
 *   - Page loads for any terminal member (read-only view of team)
 *   - Mutations require terminal owner/manager (enforced by API +
 *     surfaced as disabled inputs for non-managers)
 */
export default async function TerminalSettingsPage({ params }: Props) {
  const { ticker } = await params;
  const tickerUpper = ticker.toUpperCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: t } = await supabase
    .from("terminals")
    .select(
      "id, space_id, ticker, name, description, type, status, metadata, archived_at",
    )
    .eq("ticker", tickerUpper)
    .maybeSingle();
  if (!t) notFound();
  const terminal = t as {
    id: string;
    space_id: string;
    ticker: string;
    name: string;
    description: string | null;
    type: string;
    status: ProjectStatus;
    metadata: Record<string, unknown>;
    archived_at: string | null;
  };

  const [{ data: space }, { data: myTM }, { data: mySM }, { data: memberRows }] =
    await Promise.all([
      supabase
        .from("spaces")
        .select("name, slug")
        .eq("id", terminal.space_id)
        .single(),
      supabase
        .from("terminal_members")
        .select("role")
        .eq("terminal_id", terminal.id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("space_members")
        .select("role")
        .eq("space_id", terminal.space_id)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("terminal_members")
        .select("user_id, role, added_at")
        .eq("terminal_id", terminal.id)
        .order("added_at", { ascending: true }),
    ]);

  const spaceRow = space as { name: string; slug: string } | null;
  const myTerminalRole = (myTM as { role?: ProjectRole } | null)?.role ?? null;
  const mySpaceRole = (mySM as { role?: string } | null)?.role ?? null;

  if (!myTerminalRole && !mySpaceRole) notFound();

  const canManage =
    myTerminalRole === "owner" ||
    myTerminalRole === "manager" ||
    mySpaceRole === "owner" ||
    mySpaceRole === "admin";

  const bareMembers =
    (memberRows ?? []) as {
      user_id: string;
      role: ProjectRole;
      added_at: string;
    }[];

  const userIds = bareMembers.map((m) => m.user_id);
  const { data: profiles } = userIds.length
    ? await supabase
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .in("user_id", userIds)
    : { data: [] };

  const profileMap = new Map(
    ((profiles ?? []) as {
      user_id: string;
      full_name: string | null;
      avatar_url: string | null;
    }[]).map((p) => [p.user_id, p]),
  );

  const members = bareMembers.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    added_at: m.added_at,
    full_name: profileMap.get(m.user_id)?.full_name ?? null,
    avatar_url: profileMap.get(m.user_id)?.avatar_url ?? null,
    is_you: m.user_id === user.id,
  }));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-bg-0">
      <TopBar>
        <Link href="/" className="text-text-3 hover:text-text-1">
          Dashboard
        </Link>
        <span className="text-text-3">/</span>
        {spaceRow ? (
          <span className="text-text-1">{spaceRow.name}</span>
        ) : null}
        <span className="text-text-3">/</span>
        <Link
          href={`/p/${terminal.ticker}`}
          className="text-text-1 hover:text-text-0"
        >
          {terminal.name}
        </Link>
        <span className="text-text-3">·</span>
        <span className="text-text-0">Settings</span>
      </TopBar>
      <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
        <header className="mb-6">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wide text-accent">
              {terminal.ticker}
            </span>
            {terminal.archived_at ? (
              <span className="rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 text-[10px] uppercase text-text-3">
                archived
              </span>
            ) : null}
          </div>
          <h1 className="text-xl font-semibold text-text-0">{terminal.name}</h1>
          <p className="mt-1 text-xs text-text-3">
            Rename, change status, archive, and manage members.
          </p>
        </header>
        <TerminalSettingsForm
          initial={{
            ticker: terminal.ticker,
            name: terminal.name,
            description: terminal.description ?? "",
            status: terminal.status,
            archived: Boolean(terminal.archived_at),
          }}
          members={members}
          canManage={canManage}
          myUserId={user.id}
        />
        <SettingsHistorySection
          entityType="terminal"
          entityId={terminal.id}
          actorNames={Object.fromEntries(
            members
              .filter((m) => m.full_name)
              .map((m) => [m.user_id, m.full_name as string]),
          )}
        />
      </main>
    </div>
  );
}
