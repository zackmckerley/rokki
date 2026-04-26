import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { AdminActivityTable, type ActivityRow } from "./AdminActivityTable";
import { ActivityFilterBar, type ActivityFilterState } from "./ActivityFilterBar";

// Re-export so the virtualized ActivityRows component (added by feat/search-and-views)
// can pull the ActivityRow shape from the canonical page module.
export type { ActivityRow };

export const metadata = { title: "Activity — Admin" };
export const dynamic = "force-dynamic";

interface ActivityPageSearchParams {
  before?: string;
  actor?: string;
  /** Comma-separated list of action enum values. */
  action?: string;
  since?: string;
  until?: string;
  terminal?: string;
  q?: string;
}

const PAGE = 50;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Admin activity log. Filters live in the URL (`?actor=&action=&since=...`)
 * and apply at the DB level — `WHERE`, `ILIKE`, `IN`, no in-memory scan of
 * tens-of-thousands of rows. Default window is the last 7 days; setting
 * `since=` overrides.
 */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<ActivityPageSearchParams>;
}) {
  const params = await searchParams;
  const filter = parseFilter(params);

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let query = admin
    .from("activity")
    .select(
      "id, action, entity_type, entity_id, actor_id, terminal_id, space_id, metadata, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(PAGE);

  if (params.before) query = query.lt("created_at", params.before);
  if (filter.since) query = query.gte("created_at", filter.since);
  if (filter.until) query = query.lt("created_at", filter.until);
  if (filter.actor) query = query.eq("actor_id", filter.actor);
  if (filter.terminal) query = query.eq("terminal_id", filter.terminal);
  if (filter.actions.length > 0) {
    // Cast through `unknown` because the generated type narrows to the enum.
    query = query.in("action", filter.actions as unknown as never);
  }
  if (filter.q) {
    // Free-text search against the action column and the JSON payload. Both
    // are tested with ILIKE — Postgres casts jsonb to text for `::text`,
    // and supabase-js `.or()` combines the two predicates.
    const safe = filter.q.replace(/[%_]/g, "\\$&");
    query = query.or(
      `action.ilike.%${safe}%,metadata::text.ilike.%${safe}%`,
    );
  }

  const { data } = await query;
  const rows = (data ?? []) as ActivityRow[];

  const next =
    rows.length === PAGE ? rows[rows.length - 1]!.created_at : undefined;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-text-0">Activity</h1>
        <p className="mt-1 text-xs text-text-3">
          Every state transition across the platform. Latest first. Default
          window is 7 days; widen via the date inputs below.
        </p>
      </header>

      <ActivityFilterBar initial={filter} />

      <AdminActivityTable rows={rows} />

      {next ? (
        <div>
          <Link
            href={`/admin/activity?${appendBefore(params, next)}`}
            className="text-xs text-accent hover:underline"
          >
            Older →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function parseFilter(p: ActivityPageSearchParams): ActivityFilterState {
  const sinceDefault = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();

  const actions = (p.action ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  return {
    actor: p.actor?.trim() || null,
    actions,
    since: isIso(p.since) ? p.since! : sinceDefault,
    // `until` is optional — when omitted we go up to "now".
    until: isIso(p.until) ? p.until! : null,
    terminal: p.terminal?.trim() || null,
    q: p.q?.trim() ?? "",
  };
}

function isIso(v: string | undefined | null): boolean {
  if (!v) return false;
  const ms = Date.parse(v);
  return !Number.isNaN(ms);
}

function appendBefore(
  current: ActivityPageSearchParams,
  next: string,
): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v && k !== "before") out.set(k, v);
  }
  out.set("before", next);
  return out.toString();
}
