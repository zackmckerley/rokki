import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient } from "@/components/DashboardClient";
import {
  loadDashSpaces,
  loadDashTerminals,
  type WeekRange,
} from "@/lib/dashboard-queries";
import { TasksCardServer } from "@/components/dashboard/TasksCardServer";
import { WeekCardServer } from "@/components/dashboard/WeekCardServer";
import { TickerTapeServer } from "@/components/dashboard/TickerTapeServer";
import {
  TasksCardSkeleton,
  WeekCardSkeleton,
  TickerTapeSkeleton,
} from "@/components/dashboard/CardSkeletons";

interface Props {
  searchParams: Promise<{
    new?: string;
    space?: string;
    /** Dashboard scope filter — focus all cards on a single terminal id. */
    focus?: string;
    /** Week card time window: "today" | "week" | "month". Default "week". */
    week_range?: string;
    /** Comma-separated `calendar_connections.id` list to HIDE in Week card. */
    week_sources?: string;
    /** Ticker time window: "today" | "week" | "all". Default "all". */
    activity_range?: string;
  }>;
}

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
 *
 * `?focus=<terminalId>` narrows Week, Tasks, and the Ticker to a
 * single terminal. The picker lives in `DashboardClient`'s topbar;
 * the param is the source of truth so the focus survives reload and
 * is shareable as a deep link.
 */
export default async function DashboardPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fast queries the shell needs synchronously: viewer profile +
  // explorer rail (spaces/terminals). None of these touch the heavy
  // task / week / activity tables. The tools-count query that lived
  // here was dropped when the Tools tile came out of the explorer.
  const [spaces, terminals, profileResult] = await Promise.all([
    loadDashSpaces(supabase, user.id),
    loadDashTerminals(supabase),
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
  // `tickerById` is the historical name; the values now hold each
  // terminal's slug (URL-friendly identifier) so /p/<value> generates
  // the slug-form URL. The internal name didn't change to avoid a
  // bigger rename across TasksCard / WeekCard / tests.
  const tickerById: Record<string, string> = {};
  const terminalNameById: Record<string, string> = {};
  for (const t of terminals) {
    tickerById[t.id] = t.slug;
    terminalNameById[t.id] = t.name;
  }

  // Validate the focus param against the viewer's terminals. A stale
  // or invalid id silently degrades to no-focus rather than producing
  // an empty dashboard. Single-select; "all terminals" is the absence
  // of the param.
  const focusTerminalId =
    params.focus && terminals.some((t) => t.id === params.focus)
      ? params.focus
      : null;

  // Week card filter state. URL is the source of truth so deep links
  // and browser-back work for free.
  const weekRange: WeekRange =
    params.week_range === "today" || params.week_range === "month"
      ? (params.week_range as WeekRange)
      : "week";
  const weekHiddenSources = (params.week_sources ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Ticker time window — "today" / "week" / "all". The default keeps
  // the original "top 30 most recent" behaviour intact.
  const activityRange: "today" | "week" | "all" =
    params.activity_range === "today" || params.activity_range === "week"
      ? (params.activity_range as "today" | "week")
      : "all";

  return (
    <DashboardClient
      spaces={spaces}
      terminals={terminals}
      userId={user.id}
      userName={userName}
      userEmail={user.email ?? ""}
      isPlatformAdmin={profile?.is_platform_admin ?? false}
      initialDensity={savedDensity}
      savedTimezone={savedTimezone}
      briefingDismissedOn={briefingDismissedOn}
      focusTerminalId={focusTerminalId}
      // Streamed slots — each is its own Suspense boundary. The
      // shell + fast pieces render at ~50ms; these stream in as
      // each query resolves. The focus filter is threaded into each
      // slot so the queries scope at the DB level where possible.
      tickerSlot={
        <Suspense fallback={<TickerTapeSkeleton />}>
          <TickerTapeServer
            projectId={focusTerminalId ?? undefined}
            range={activityRange}
          />
        </Suspense>
      }
      weekSlot={
        <Suspense fallback={<WeekCardSkeleton range={weekRange} />}>
          <WeekCardServer
            userId={user.id}
            scopeTerminalId={focusTerminalId}
            range={weekRange}
            hiddenSourceIds={weekHiddenSources}
          />
        </Suspense>
      }
      tasksSlot={
        <Suspense fallback={<TasksCardSkeleton />}>
          <TasksCardServer
            userId={user.id}
            tickerById={tickerById}
            terminalNameById={terminalNameById}
            createDisabled={terminals.length === 0}
            scopeTerminalId={focusTerminalId}
          />
        </Suspense>
      }
    />
  );
}
