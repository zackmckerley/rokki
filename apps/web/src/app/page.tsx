import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/components/DashboardClient";
import {
  loadDashSpaces,
  loadDashTerminals,
  loadAssignedTasks,
  loadDelegatedTasks,
  loadWeekItems,
} from "@/lib/dashboard-queries";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pure-admin shortcut: a user who is platform admin AND has zero space
  // memberships has nothing to do on the user dashboard. Send them
  // straight to /admin so the operator console is their landing.
  const adminCheck = await supabase
    .from("profiles")
    .select("is_platform_admin")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = Boolean(
    (adminCheck.data as { is_platform_admin?: boolean } | null)
      ?.is_platform_admin,
  );
  if (isAdmin) {
    const { count: spaceCount } = await supabase
      .from("space_members")
      .select("space_id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if ((spaceCount ?? 0) === 0) {
      redirect("/admin");
    }
  }

  // Parallelise: every card fetches independently against RLS.
  const [
    spaces,
    terminals,
    assigned,
    delegated,
    weekItems,
    toolsResult,
    activityResult,
    profileResult,
  ] = await Promise.all([
    loadDashSpaces(supabase, user.id),
    loadDashTerminals(supabase),
    loadAssignedTasks(supabase, user.id),
    loadDelegatedTasks(supabase, user.id),
    loadWeekItems(supabase, user.id),
    supabase
      .from("tools")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("activity")
      .select("id, action, actor_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("profiles")
      .select("full_name, is_platform_admin, settings, timezone")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const profile = profileResult.data as
    | {
        full_name: string | null;
        is_platform_admin: boolean;
        settings: Record<string, unknown> | null;
        timezone: string | null;
      }
    | null;
  const userName =
    profile?.full_name ?? user.email?.split("@")[0] ?? "there";
  const savedDensity =
    profile?.settings?.density === "compact" ? "compact" : "cozy";
  const savedTimezone = profile?.timezone ?? null;
  const briefingDismissedOn =
    typeof profile?.settings?.briefing_dismissed_on === "string"
      ? (profile!.settings!.briefing_dismissed_on as string)
      : null;

  type ActivityRow = {
    id: string;
    action: string;
    actor_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
  };
  const tickerItems = ((activityResult.data ?? []) as ActivityRow[]).map(
    (a) => ({
      id: a.id,
      text: summarizeActivity(a.action, a.metadata),
      when: relativeTime(a.created_at),
    }),
  );

  return (
    <DashboardClient
      spaces={spaces}
      terminals={terminals}
      assigned={assigned}
      delegated={delegated}
      weekItems={weekItems}
      tickerItems={tickerItems}
      toolCount={toolsResult.count ?? 0}
      userId={user.id}
      userName={userName}
      userEmail={user.email ?? ""}
      isPlatformAdmin={profile?.is_platform_admin ?? false}
      initialDensity={savedDensity}
      savedTimezone={savedTimezone}
      briefingDismissedOn={briefingDismissedOn}
    />
  );
}

function summarizeActivity(
  action: string,
  metadata: Record<string, unknown> | null,
): string {
  const pick = (k: string): string | null => {
    const v = metadata?.[k];
    return typeof v === "string" ? v : null;
  };
  // Rich, specific phrasing per action — used to be a generic
  // ".replace(/[._]/g, ' ')" fallback that produced garbage like
  // "tasks updated", which is what Zack flagged as "I want more
  // detail than 'task updated'." Cases are sorted by frequency.
  switch (action) {
    case "task.create":
      return `task created: ${pick("title") ?? "(untitled)"}`;
    case "task.complete":
      return `task completed: ${pick("title") ?? "(untitled)"}`;
    case "task.update":
    case "task_updated":
      return `task updated: ${pick("title") ?? "(untitled)"}`;
    case "task.delete":
      return `task deleted: ${pick("title") ?? "(untitled)"}`;
    case "task.assigned":
      return `assigned: ${pick("title") ?? "(untitled)"}`;
    case "terminal.create":
      return `new terminal: ${pick("name") ?? "(unnamed)"}`;
    case "terminal.update":
    case "terminal_updated":
      return `terminal updated: ${pick("name") ?? ""}`.trim();
    case "terminal.archive":
      return `archived ${pick("name") ?? "a terminal"}`;
    case "file.upload":
      return `uploaded ${pick("filename") ?? "a file"}`;
    case "file.delete":
      return `deleted ${pick("filename") ?? "a file"}`;
    case "file.update":
    case "file_updated":
      return `file updated: ${pick("filename") ?? ""}`.trim();
    case "comment.create":
      return `commented on ${pick("entity_kind") ?? "a task"}`;
    case "comment.update":
    case "comment_updated":
      return `comment edited`;
    case "member.invite":
      return `invited ${pick("email") ?? "a member"}`;
    case "member.join":
      return `${pick("name") ?? "someone"} joined`;
    case "member.remove":
      return `removed ${pick("name") ?? "a member"}`;
    case "space_updated":
    case "space.update":
      return `space updated: ${pick("name") ?? ""}`.trim();
    default:
      return action.replace(/[._]/g, " ");
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
