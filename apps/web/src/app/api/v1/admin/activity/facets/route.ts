import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

import { withObservability } from "@/lib/observability";
interface ActorRow {
  actor_id: string;
}

interface TerminalRow {
  terminal_id: string;
}

interface ActionRow {
  action: string;
}

/**
 * GET /api/v1/admin/activity/facets
 *
 *   - actors:    most-recent 100 unique actor_ids (with profile email/name)
 *   - terminals: most-recent 100 unique terminal_ids (with ticker/name)
 *   - actions:   sorted distinct action enum values seen in the table
 *
 * Used to populate the dropdowns in the audit-log filter bar. Cheap-ish:
 * each query is a small, indexed scan over the tail of `activity` plus a
 * single profile/terminal lookup per id.
 */
async function handleGet(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  // Pull a bounded recent slice once and derive the three facets from it.
  // 5000 rows is enough to cover ~weeks of activity without paginating.
  const { data: recent, error } = await admin
    .from("activity")
    .select("actor_id, terminal_id, action")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) return internal(error.message);

  const rows = (recent ?? []) as Array<{
    actor_id: string | null;
    terminal_id: string | null;
    action: string;
  }>;

  // Preserve recency order while deduping.
  const actorOrder = new Set<string>();
  const terminalOrder = new Set<string>();
  const actions = new Set<string>();
  for (const r of rows) {
    if (r.actor_id) actorOrder.add(r.actor_id);
    if (r.terminal_id) terminalOrder.add(r.terminal_id);
    actions.add(r.action);
  }
  const actorIds = Array.from(actorOrder).slice(0, 100);
  const terminalIds = Array.from(terminalOrder).slice(0, 100);

  const [{ data: profiles }, { data: terminals }, authList] = await Promise.all([
    actorIds.length
      ? admin
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", actorIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; full_name: string | null }> }),
    terminalIds.length
      ? admin
          .from("terminals")
          .select("id, ticker, name")
          .in("id", terminalIds)
      : Promise.resolve({ data: [] as Array<{ id: string; ticker: string; name: string }> }),
    actorIds.length
      ? admin.auth.admin.listUsers({ perPage: 200, page: 1 })
      : Promise.resolve({ data: { users: [] } }),
  ]);

  const profMap = new Map(
    ((profiles ?? []) as Array<{ user_id: string; full_name: string | null }>).map(
      (p) => [p.user_id, p.full_name],
    ),
  );
  const emailMap = new Map(
    (authList?.data?.users ?? []).map((u) => [u.id, u.email ?? ""]),
  );
  const termMap = new Map(
    ((terminals ?? []) as Array<{ id: string; ticker: string; name: string }>).map(
      (t) => [t.id, t],
    ),
  );

  return NextResponse.json({
    data: {
      actors: actorIds.map((id) => ({
        actor_id: id,
        email: emailMap.get(id) ?? "",
        full_name: profMap.get(id) ?? null,
      })) satisfies (ActorRow & { email: string; full_name: string | null })[],
      terminals: terminalIds
        .map((id) => {
          const t = termMap.get(id);
          if (!t) return null;
          return { terminal_id: id, ticker: t.ticker, name: t.name };
        })
        .filter((v): v is { terminal_id: string; ticker: string; name: string } =>
          v !== null,
        ) satisfies (TerminalRow & { ticker: string; name: string })[],
      actions: Array.from(actions).sort() satisfies string[] | ActionRow[],
    },
  });
}

function internal(msg: string) {
  return NextResponse.json(
    { errors: [{ code: "internal_error", message: msg }] },
    { status: 500 },
  );
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/admin/activity/facets",
);
