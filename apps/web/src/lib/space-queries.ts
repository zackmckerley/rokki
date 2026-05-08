/**
 * Server-side data loaders for the space landing page (`/s/:slug`).
 *
 * Each loader is scoped to a single space by id. The page calls
 * them in parallel and renders one combined client tree, mirroring
 * the dashboard's "all cards in a single round-trip" pattern from
 * `dashboard-queries.ts`.
 *
 * RLS does the access enforcement; these loaders assume the caller
 * has already verified the user is a member of the space (so we
 * can return rich aggregates without leaking).
 */
import { traceSpan } from "./observability";

type AnySupabaseClient = any;

export interface SpaceTerminalCard {
  id: string;
  ticker: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
  member_count: number;
  open_task_count: number;
  done_task_count: number;
}

export interface SpaceTaskRow {
  id: string;
  ticker_seq: number;
  title: string;
  status: string;
  priority: number;
  due_date: string | null;
  terminal_id: string;
  ticker: string | null;
  assignees: { user_id: string; full_name: string | null }[];
}

export interface SpaceMemberRow {
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  full_name: string | null;
  email: string | null;
  /**
   * Count of terminals in *this space* the member is currently a
   * member of. `0` is a valid signal — they're in the space but
   * haven't been added to a working context yet.
   */
  terminal_count: number;
  /** Active assigned tasks across this space (status != done). */
  active_task_count: number;
}

export interface SpaceActivityRow {
  id: string;
  action: string;
  actor_id: string | null;
  terminal_id: string | null;
  metadata: Record<string, unknown> | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  created_at: string;
}

export interface SpaceLobbyMessage {
  id: string;
  body: string;
  author_id: string;
  author_name: string | null;
  created_at: string;
}

/**
 * Load every terminal in the space + its aggregate counts. Three
 * round-trips (terminals, members, tasks) joined client-side
 * because the supabase generic select can't express the aggregate
 * in one call cleanly.
 */
export async function loadSpaceTerminals(
  supabase: AnySupabaseClient,
  spaceId: string,
): Promise<SpaceTerminalCard[]> {
  return traceSpan(
    {
      name: "db.space.terminals",
      op: "db.query",
      attributes: { table: "terminals" },
    },
    async () => {
      const { data: terminalRows } = await supabase
        .from("terminals")
        .select("id, ticker, name, status, created_at, updated_at")
        .eq("space_id", spaceId)
        .is("archived_at", null)
        .order("updated_at", { ascending: false });
      type TRow = {
        id: string;
        ticker: string;
        name: string;
        status: string;
        created_at: string;
        updated_at: string;
      };
      const terminals = (terminalRows ?? []) as TRow[];
      if (terminals.length === 0) return [];

      const ids = terminals.map((t) => t.id);

      const [membersResult, openTasksResult, doneTasksResult] =
        await Promise.all([
          supabase
            .from("terminal_members")
            .select("terminal_id")
            .in("terminal_id", ids),
          supabase
            .from("tasks")
            .select("terminal_id")
            .in("terminal_id", ids)
            .neq("status", "done")
            .is("deleted_at", null),
          supabase
            .from("tasks")
            .select("terminal_id")
            .in("terminal_id", ids)
            .eq("status", "done")
            .is("deleted_at", null),
        ]);

      const memberCounts = new Map<string, number>();
      for (const r of (membersResult.data ?? []) as {
        terminal_id: string;
      }[]) {
        memberCounts.set(r.terminal_id, (memberCounts.get(r.terminal_id) ?? 0) + 1);
      }
      const openCounts = new Map<string, number>();
      for (const r of (openTasksResult.data ?? []) as {
        terminal_id: string;
      }[]) {
        openCounts.set(r.terminal_id, (openCounts.get(r.terminal_id) ?? 0) + 1);
      }
      const doneCounts = new Map<string, number>();
      for (const r of (doneTasksResult.data ?? []) as {
        terminal_id: string;
      }[]) {
        doneCounts.set(r.terminal_id, (doneCounts.get(r.terminal_id) ?? 0) + 1);
      }

      return terminals.map((t) => ({
        ...t,
        member_count: memberCounts.get(t.id) ?? 0,
        open_task_count: openCounts.get(t.id) ?? 0,
        done_task_count: doneCounts.get(t.id) ?? 0,
      }));
    },
  );
}

/**
 * Load aggregate task signals for the space — the cross-cutting
 * roll-up the dashboard's TasksCard can't show because it's
 * personal-only.
 */
export async function loadSpaceTasks(
  supabase: AnySupabaseClient,
  spaceId: string,
): Promise<{
  assignedToMe: SpaceTaskRow[];
  overdue: SpaceTaskRow[];
  blocked: SpaceTaskRow[];
  dueThisWeek: SpaceTaskRow[];
}> {
  return traceSpan(
    {
      name: "db.space.tasks",
      op: "db.query",
      attributes: { table: "tasks" },
    },
    async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return {
          assignedToMe: [],
          overdue: [],
          blocked: [],
          dueThisWeek: [],
        };
      }

      // Resolve terminals in this space first so every task query
      // can stay in a single `.in("terminal_id", ids)` filter — RLS
      // handles the per-row read check.
      const { data: terminals } = await supabase
        .from("terminals")
        .select("id, ticker")
        .eq("space_id", spaceId)
        .is("archived_at", null);
      type TRow = { id: string; ticker: string };
      const tList = (terminals ?? []) as TRow[];
      const tickerById = new Map(tList.map((t) => [t.id, t.ticker]));
      const ids = tList.map((t) => t.id);
      if (ids.length === 0) {
        return {
          assignedToMe: [],
          overdue: [],
          blocked: [],
          dueThisWeek: [],
        };
      }

      const todayIso = new Date().toISOString().slice(0, 10);
      const weekFromNow = new Date();
      weekFromNow.setDate(weekFromNow.getDate() + 7);
      const weekIso = weekFromNow.toISOString().slice(0, 10);

      const [
        { data: assignedTaskIds },
        { data: openTasks },
        { data: blockedTasks },
      ] = await Promise.all([
        supabase
          .from("task_assignees")
          .select("task_id")
          .eq("user_id", user.id),
        supabase
          .from("tasks")
          .select(
            "id, ticker_seq, title, status, priority, due_date, terminal_id",
          )
          .in("terminal_id", ids)
          .neq("status", "done")
          .is("deleted_at", null),
        supabase
          .from("tasks")
          .select(
            "id, ticker_seq, title, status, priority, due_date, terminal_id",
          )
          .in("terminal_id", ids)
          .eq("status", "blocked")
          .is("deleted_at", null),
      ]);

      type TaskCore = {
        id: string;
        ticker_seq: number;
        title: string;
        status: string;
        priority: number;
        due_date: string | null;
        terminal_id: string;
      };

      const myAssignedIds = new Set(
        ((assignedTaskIds ?? []) as { task_id: string }[]).map(
          (r) => r.task_id,
        ),
      );
      const open = (openTasks ?? []) as TaskCore[];
      const blocked = (blockedTasks ?? []) as TaskCore[];

      // Pull assignees for the visible task ids in one round-trip.
      const visibleIds = Array.from(
        new Set([
          ...open.map((t) => t.id),
          ...blocked.map((t) => t.id),
        ]),
      );
      const { data: assigneeRows } = visibleIds.length
        ? await supabase
            .from("task_assignees")
            .select("task_id, user_id")
            .in("task_id", visibleIds)
        : { data: [] };
      type ARow = { task_id: string; user_id: string };
      const userIds = Array.from(
        new Set(
          ((assigneeRows ?? []) as ARow[]).map((r) => r.user_id),
        ),
      );
      const { data: profiles } = userIds.length
        ? await supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", userIds)
        : { data: [] };
      type PRow = { user_id: string; full_name: string | null };
      const nameById = new Map(
        ((profiles ?? []) as PRow[]).map((p) => [p.user_id, p.full_name]),
      );
      const assigneesByTask = new Map<
        string,
        SpaceTaskRow["assignees"]
      >();
      for (const r of (assigneeRows ?? []) as ARow[]) {
        const list = assigneesByTask.get(r.task_id) ?? [];
        list.push({
          user_id: r.user_id,
          full_name: nameById.get(r.user_id) ?? null,
        });
        assigneesByTask.set(r.task_id, list);
      }

      function decorate(t: TaskCore): SpaceTaskRow {
        return {
          id: t.id,
          ticker_seq: t.ticker_seq,
          title: t.title,
          status: t.status,
          priority: t.priority,
          due_date: t.due_date,
          terminal_id: t.terminal_id,
          ticker: tickerById.get(t.terminal_id) ?? null,
          assignees: assigneesByTask.get(t.id) ?? [],
        };
      }

      const assignedToMe = open
        .filter((t) => myAssignedIds.has(t.id))
        .map(decorate);
      const overdue = open
        .filter((t) => t.due_date && t.due_date < todayIso)
        .map(decorate);
      const dueThisWeek = open
        .filter(
          (t) =>
            t.due_date && t.due_date >= todayIso && t.due_date <= weekIso,
        )
        .map(decorate);
      const blockedDecorated = blocked.map(decorate);

      return {
        assignedToMe,
        overdue,
        blocked: blockedDecorated,
        dueThisWeek,
      };
    },
  );
}

/**
 * Load every member of the space with their roll-up counts so the
 * directory card can show "who's involved + how busy."
 */
export async function loadSpaceMembers(
  supabase: AnySupabaseClient,
  spaceId: string,
): Promise<SpaceMemberRow[]> {
  return traceSpan(
    {
      name: "db.space.members",
      op: "db.query",
      attributes: { table: "space_members" },
    },
    async () => {
      const { data: rawMembers } = await supabase
        .from("space_members")
        .select("user_id, role, joined_at")
        .eq("space_id", spaceId)
        .order("joined_at", { ascending: true });
      type MRow = {
        user_id: string;
        role: "owner" | "admin" | "member";
        joined_at: string;
      };
      const members = (rawMembers ?? []) as MRow[];
      if (members.length === 0) return [];

      const userIds = members.map((m) => m.user_id);

      const [
        { data: profiles },
        { data: terminalsInSpace },
      ] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds),
        supabase
          .from("terminals")
          .select("id")
          .eq("space_id", spaceId)
          .is("archived_at", null),
      ]);

      type PRow = {
        user_id: string;
        full_name: string | null;
        email: string | null;
      };
      const profileById = new Map(
        ((profiles ?? []) as PRow[]).map((p) => [p.user_id, p]),
      );

      const terminalIds = ((terminalsInSpace ?? []) as { id: string }[]).map(
        (t) => t.id,
      );

      // Per-member terminal count = how many terminals in this space
      // they're a member of. Plus their open assigned-task count.
      const [
        { data: termMemberRows },
        { data: assigneeRows },
      ] = terminalIds.length
        ? await Promise.all([
            supabase
              .from("terminal_members")
              .select("terminal_id, user_id")
              .in("terminal_id", terminalIds)
              .in("user_id", userIds),
            supabase
              .from("task_assignees")
              .select(
                "user_id, tasks!task_assignees_task_id_fkey(status, terminal_id, deleted_at)",
              )
              .in("user_id", userIds),
          ])
        : [{ data: [] }, { data: [] }];

      const terminalCountByUser = new Map<string, number>();
      for (const r of (termMemberRows ?? []) as {
        user_id: string;
      }[]) {
        terminalCountByUser.set(
          r.user_id,
          (terminalCountByUser.get(r.user_id) ?? 0) + 1,
        );
      }

      type ARow = {
        user_id: string;
        tasks: {
          status: string;
          terminal_id: string;
          deleted_at: string | null;
        } | null;
      };
      const terminalIdSet = new Set(terminalIds);
      const activeTaskCountByUser = new Map<string, number>();
      for (const r of (assigneeRows ?? []) as unknown as ARow[]) {
        if (!r.tasks) continue;
        if (r.tasks.deleted_at) continue;
        if (r.tasks.status === "done") continue;
        if (!terminalIdSet.has(r.tasks.terminal_id)) continue;
        activeTaskCountByUser.set(
          r.user_id,
          (activeTaskCountByUser.get(r.user_id) ?? 0) + 1,
        );
      }

      return members.map((m) => {
        const p = profileById.get(m.user_id);
        return {
          user_id: m.user_id,
          role: m.role,
          joined_at: m.joined_at,
          full_name: p?.full_name ?? null,
          email: p?.email ?? null,
          terminal_count: terminalCountByUser.get(m.user_id) ?? 0,
          active_task_count: activeTaskCountByUser.get(m.user_id) ?? 0,
        };
      });
    },
  );
}

/**
 * Load the most recent activity rows scoped to terminals in this
 * space — feeds the space-wide ticker tape (item #3).
 */
export async function loadSpaceActivity(
  supabase: AnySupabaseClient,
  spaceId: string,
  limit: number = 30,
): Promise<SpaceActivityRow[]> {
  return traceSpan(
    {
      name: "db.space.activity",
      op: "db.query",
      attributes: { table: "activity" },
    },
    async () => {
      const { data: terminals } = await supabase
        .from("terminals")
        .select("id")
        .eq("space_id", spaceId)
        .is("archived_at", null);
      const ids = ((terminals ?? []) as { id: string }[]).map((t) => t.id);
      if (ids.length === 0) return [];

      const { data } = await supabase
        .from("activity")
        .select(
          "id, action, actor_id, terminal_id, metadata, before_json, after_json, created_at",
        )
        .in("terminal_id", ids)
        .order("created_at", { ascending: false })
        .limit(limit);
      return (data ?? []) as SpaceActivityRow[];
    },
  );
}

/**
 * Load the most recent messages from the space's lobby thread (the
 * single `kind = 'space'` thread for this space, auto-provisioned
 * elsewhere). Returns up to `limit` newest-first.
 */
export async function loadSpaceLobby(
  supabase: AnySupabaseClient,
  spaceId: string,
  limit: number = 8,
): Promise<{ threadId: string | null; messages: SpaceLobbyMessage[] }> {
  return traceSpan(
    {
      name: "db.space.lobby",
      op: "db.query",
      attributes: { table: "messages" },
    },
    async () => {
      const { data: thread } = await supabase
        .from("message_threads")
        .select("id")
        .eq("kind", "space")
        .eq("space_id", spaceId)
        .maybeSingle();
      const threadId = (thread as { id: string } | null)?.id ?? null;
      if (!threadId) return { threadId: null, messages: [] };

      const { data: rows } = await supabase
        .from("messages")
        .select("id, body, author_id, created_at")
        .eq("thread_id", threadId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(limit);
      type MRow = {
        id: string;
        body: string;
        author_id: string;
        created_at: string;
      };
      const messages = (rows ?? []) as MRow[];

      const userIds = Array.from(new Set(messages.map((m) => m.author_id)));
      const { data: profiles } = userIds.length
        ? await supabase
            .from("profiles")
            .select("user_id, full_name")
            .in("user_id", userIds)
        : { data: [] };
      type PRow = { user_id: string; full_name: string | null };
      const nameById = new Map(
        ((profiles ?? []) as PRow[]).map((p) => [p.user_id, p.full_name]),
      );

      return {
        threadId,
        messages: messages.map((m) => ({
          id: m.id,
          body: m.body,
          author_id: m.author_id,
          author_name: nameById.get(m.author_id) ?? null,
          created_at: m.created_at,
        })),
      };
    },
  );
}

