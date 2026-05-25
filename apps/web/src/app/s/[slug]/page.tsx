import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SpaceClient } from "@/components/space/SpaceClient";
import {
  loadDashSpaces,
  loadDashTerminals,
} from "@/lib/dashboard-queries";
import {
  loadSpaceActivity,
  loadSpaceLobby,
  loadSpaceMembers,
  loadSpaceTasks,
  loadSpaceTerminals,
} from "@/lib/space-queries";
import { summarizeActivity } from "@/lib/activity-summary";

interface Props {
  params: Promise<{ slug: string }>;
}

type SpaceRole = "owner" | "admin" | "member";

/**
 * Space landing — `/s/<slug>`.
 *
 * Surfaces seven cards in a single round-trip: Terminals grid,
 * cross-cutting Tasks roll-up, This Week, Members, Lobby messages,
 * Recent files, plus a space-scoped activity ticker. The
 * shell/topbar/explorer mirror the dashboard so navigating
 * between the three feels seamless.
 *
 * Route guard: caller must be a member of the space (`space_members`).
 * RLS would already filter most of the underlying queries, but
 * the explicit check lets us return a clean 404 instead of a half-
 * empty page when the slug doesn't resolve.
 */
export default async function SpaceLandingPage({ params }: Props) {
  const { slug } = await params;
  const lower = slug.toLowerCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect_to=${encodeURIComponent(`/s/${lower}`)}`);

  const { data: space } = await supabase
    .from("spaces")
    .select("id, slug, name")
    .eq("slug", lower)
    .maybeSingle();
  if (!space) notFound();
  const s = space as { id: string; slug: string; name: string };

  // The membership check used to gate the Promise.all on a separate
  // RTT. Now it runs ALONGSIDE the data fetches. Non-members never
  // reach the render (notFound() short-circuits after the parallel
  // resolves), so the only "wasted" case is someone hitting a space
  // URL they don't belong to — which should be rare and is cheap to
  // throw away. RLS already filters the actual data rows.
  //
  // All the heavy lifting in parallel — same pattern as the
  // dashboard's loaders. The week-calendar / files-vault loaders
  // were dropped after the v1 ship per UX feedback ("remove the
  // calendar … no need for recent files").
  const [
    terminals,
    tasks,
    members,
    activity,
    lobby,
    explorerSpaces,
    explorerTerminals,
    profileResult,
    membershipResult,
  ] = await Promise.all([
    loadSpaceTerminals(supabase, s.id),
    loadSpaceTasks(supabase, s.id),
    loadSpaceMembers(supabase, s.id),
    loadSpaceActivity(supabase, s.id, 30),
    loadSpaceLobby(supabase, s.id, 8),
    loadDashSpaces(supabase, user.id),
    loadDashTerminals(supabase),
    supabase
      .from("profiles")
      .select("full_name, is_platform_admin, settings")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("space_members")
      .select("role")
      .eq("space_id", s.id)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const myRole =
    (membershipResult.data as { role?: SpaceRole } | null)?.role ?? null;
  if (!myRole) notFound();

  const profile = profileResult.data as
    | {
        full_name: string | null;
        is_platform_admin: boolean;
        settings: Record<string, unknown> | null;
      }
    | null;
  const userName = profile?.full_name ?? user.email?.split("@")[0] ?? "—";
  const isPlatformAdmin = Boolean(profile?.is_platform_admin);
  const initialDensity =
    profile?.settings?.density === "compact" ? "compact" : "cozy";

  // Tiny ticker label per activity row. Uses the shared
  // `summarizeActivity` helper so dashboard / space / terminal
  // tickers all read the same way.
  const tickerItems = activity.map((a) => ({
    id: a.id,
    text: summarizeActivity({
      action: a.action,
      metadata: a.metadata,
      before_json: a.before_json,
      after_json: a.after_json,
    }),
    when: relativeTime(a.created_at),
  }));

  return (
    <SpaceClient
      space={s}
      myRole={myRole}
      spaces={explorerSpaces}
      allTerminals={explorerTerminals}
      userName={userName}
      userEmail={user.email ?? ""}
      isPlatformAdmin={isPlatformAdmin}
      initialDensity={initialDensity}
      terminals={terminals}
      tasks={tasks}
      members={members}
      lobby={{ hasThread: lobby.threadId !== null, messages: lobby.messages }}
      tickerItems={tickerItems}
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
