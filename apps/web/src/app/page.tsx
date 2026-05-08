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
import { summarizeActivity } from "@/lib/activity-summary";

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
      .select(
        "id, action, actor_id, metadata, before_json, after_json, created_at",
      )
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
    before_json: Record<string, unknown> | null;
    after_json: Record<string, unknown> | null;
    created_at: string;
  };
  const tickerItems = ((activityResult.data ?? []) as ActivityRow[]).map(
    (a) => ({
      id: a.id,
      text: summarizeActivity({
        action: a.action,
        metadata: a.metadata,
        before_json: a.before_json,
        after_json: a.after_json,
      }),
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
