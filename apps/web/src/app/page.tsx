import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/components/DashboardClient";
import {
  loadDashSpaces,
  loadDashTerminals,
} from "@/lib/dashboard-queries";
import { TasksCardServer } from "@/components/dashboard/TasksCardServer";
import { WeekCardServer } from "@/components/dashboard/WeekCardServer";
import { TickerTapeServer } from "@/components/dashboard/TickerTapeServer";
import {
  TasksCardSkeleton,
  WeekCardSkeleton,
  TickerTapeSkeleton,
} from "@/components/dashboard/CardSkeletons";

/**
 * Dashboard route. Streams the slow cards into the shell so the
 * fast pieces paint immediately and the heavy queries don't gate
 * first paint.
 *
 * Critical-path Promise.all = fast queries the SHELL needs to render
 * (profile, spaces, terminals, tools). Slow cards each own their
 * own data fetch via Server Components below, wrapped in Suspense.
 * Real-world cold-load drops from "wait for slowest of 8 queries"
 * to "wait for slowest of 4 fast queries" + streaming for the rest.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fast queries the shell needs synchronously: viewer profile +
  // explorer rail (spaces/terminals) + tools count. None of these
  // touch the heavy task / week / activity tables.
  const [spaces, terminals, toolsResult, profileResult] = await Promise.all([
    loadDashSpaces(supabase, user.id),
    loadDashTerminals(supabase),
    supabase
      .from("tools")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
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

  // Pure-admin shortcut: a user who is platform admin AND has zero
  // space memberships has nothing to do on the user dashboard. Send
  // them to /admin so the operator console is their landing.
  if ((profile?.is_platform_admin ?? false) && spaces.length === 0) {
    redirect("/admin");
  }

  const userName =
    profile?.full_name ?? user.email?.split("@")[0] ?? "there";
  const savedDensity =
    profile?.settings?.density === "compact" ? "compact" : "cozy";
  const savedTimezone = profile?.timezone ?? null;
  const briefingDismissedOn =
    typeof profile?.settings?.briefing_dismissed_on === "string"
      ? (profile!.settings!.briefing_dismissed_on as string)
      : null;

  // Build the ticker/name maps once at the page level — shared by
  // ExplorerRail (in DashboardClient) and TasksCardServer below.
  const tickerById: Record<string, string> = {};
  const terminalNameById: Record<string, string> = {};
  for (const t of terminals) {
    tickerById[t.id] = t.ticker;
    terminalNameById[t.id] = t.name;
  }

  return (
    <DashboardClient
      spaces={spaces}
      terminals={terminals}
      toolCount={toolsResult.count ?? 0}
      userId={user.id}
      userName={userName}
      userEmail={user.email ?? ""}
      isPlatformAdmin={profile?.is_platform_admin ?? false}
      initialDensity={savedDensity}
      savedTimezone={savedTimezone}
      briefingDismissedOn={briefingDismissedOn}
      // Streamed slots — each is its own Suspense boundary. The
      // shell + fast pieces render at ~50ms; these stream in as
      // each query resolves.
      tickerSlot={
        <Suspense fallback={<TickerTapeSkeleton />}>
          <TickerTapeServer />
        </Suspense>
      }
      weekSlot={
        <Suspense fallback={<WeekCardSkeleton />}>
          <WeekCardServer userId={user.id} />
        </Suspense>
      }
      tasksSlot={
        <Suspense fallback={<TasksCardSkeleton />}>
          <TasksCardServer
            userId={user.id}
            tickerById={tickerById}
            terminalNameById={terminalNameById}
            createDisabled={terminals.length === 0}
          />
        </Suspense>
      }
    />
  );
}
