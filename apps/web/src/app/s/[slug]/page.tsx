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

  const { data: me } = await supabase
    .from("space_members")
    .select("role")
    .eq("space_id", s.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const myRole = (me as { role?: SpaceRole } | null)?.role ?? null;
  if (!myRole) notFound();

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
    toolsResult,
    profileResult,
  ] = await Promise.all([
    loadSpaceTerminals(supabase, s.id),
    loadSpaceTasks(supabase, s.id),
    loadSpaceMembers(supabase, s.id),
    loadSpaceActivity(supabase, s.id, 30),
    loadSpaceLobby(supabase, s.id, 8),
    loadDashSpaces(supabase, user.id),
    loadDashTerminals(supabase),
    supabase
      .from("tools")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("profiles")
      .select("full_name, is_platform_admin, settings")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

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

  // Build a tiny ticker label per activity row. Mirrors the
  // dashboard's `summarizeActivity` so the ticker reads the same
  // across surfaces.
  const tickerItems = activity.map((a) => ({
    id: a.id,
    text: summarizeActivity(a.action, a.metadata ?? {}),
    when: relativeTime(a.created_at),
  }));

  return (
    <SpaceClient
      space={s}
      myRole={myRole}
      spaces={explorerSpaces}
      allTerminals={explorerTerminals}
      toolCount={toolsResult.count ?? 0}
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

function summarizeActivity(
  action: string,
  metadata: Record<string, unknown>,
): string {
  // Mirror of the dashboard's summarizeActivity (apps/web/src/app/page.tsx)
  // — kept local for the space ticker so we don't have to plumb
  // it through props. Both should be edited together.
  const pick = (k: string): string | null => {
    const v = metadata[k];
    return typeof v === "string" ? v : null;
  };
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
