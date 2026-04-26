/**
 * Business metrics — read-only derivations from existing tables.
 *
 * No new schema. Every query is bounded by `created_at >= since` (or
 * the appropriate timestamp column) so we don't accidentally do a
 * sequential scan on the full activity log. Once the data volume
 * outgrows on-the-fly aggregation, materialize via a daily rollup job
 * (see TODO at the bottom).
 *
 * Service-role client is required — these are admin queries, RLS
 * would either filter to the operator's own visibility or refuse.
 */
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";

type Admin = ReturnType<typeof createAdminClient<Database>>;

export interface MetricsData {
  range: { since: string; until: string; days: number };
  active_users: { dau: number; wau: number; mau: number };
  tasks_created: TimeSeries;
  files: { uploads: TimeSeries; total_bytes: number };
  comments_posted: TimeSeries;
  spaces_per_week: TimeSeries;
  terminals_per_week: TimeSeries;
  notifications: { sent: number; read: number; ratio: number };
  retention: CohortRetention[];
}

export interface TimeSeries {
  /** ISO date 'YYYY-MM-DD' bucket -> count. Sorted ascending. */
  buckets: Array<{ date: string; value: number }>;
  total: number;
}

export interface CohortRetention {
  /** Monday of the signup-week cohort. */
  cohort_week: string;
  cohort_size: number;
  /** week_n[i] = % of cohort active in week i (0 = signup week). */
  week_n: number[];
}

export async function loadMetrics(
  admin: Admin,
  days: number,
): Promise<MetricsData> {
  const until = new Date();
  const since = new Date(until.getTime() - days * 86_400_000);
  const sinceISO = since.toISOString();

  const [
    { data: activityRows },
    { data: taskRows },
    { data: fileRows },
    { data: commentRows },
    { data: spaceRows },
    { data: terminalRows },
    { data: notifRows },
    { data: signupRows },
  ] = await Promise.all([
    // DAU/WAU/MAU — distinct user_id from activity. We intentionally
    // ignore service-role activity (actor_id NULL) by virtue of the
    // distinct count later.
    admin
      .from("activity")
      .select("actor_id, created_at")
      .gte("created_at", sinceISO)
      .not("actor_id", "is", null)
      .limit(100_000),
    admin
      .from("tasks")
      .select("created_at")
      .gte("created_at", sinceISO)
      .limit(100_000),
    admin
      .from("files")
      .select("uploaded_at, size_bytes")
      .gte("uploaded_at", sinceISO)
      .is("deleted_at", null)
      .limit(100_000),
    admin
      .from("comments")
      .select("created_at")
      .gte("created_at", sinceISO)
      .is("deleted_at", null)
      .limit(100_000),
    admin
      .from("spaces")
      .select("created_at")
      .gte("created_at", sinceISO)
      .limit(10_000),
    admin
      .from("terminals")
      .select("created_at")
      .gte("created_at", sinceISO)
      .limit(10_000),
    admin
      .from("notifications")
      .select("created_at, read_at")
      .gte("created_at", sinceISO)
      .limit(100_000),
    // Cohort retention needs signups across a wider window so cohorts have
    // at least 4 weeks of follow-up data. Pull 12 weeks back regardless.
    admin
      .from("profiles")
      .select("user_id, created_at")
      .gte("created_at", new Date(until.getTime() - 12 * 7 * 86_400_000).toISOString())
      .limit(100_000),
  ]);

  const activity = (activityRows ?? []) as Array<{
    actor_id: string | null;
    created_at: string;
  }>;

  const dau = distinctUsersInWindow(activity, 1);
  const wau = distinctUsersInWindow(activity, 7);
  const mau = distinctUsersInWindow(activity, 30);

  const tasksSeries = bucketByDay(
    (taskRows ?? []).map((r) => (r as { created_at: string }).created_at),
    days,
  );

  const filesSeries = bucketByDay(
    (fileRows ?? []).map((r) => (r as { uploaded_at: string }).uploaded_at),
    days,
  );
  const totalBytes = (fileRows ?? []).reduce(
    (n, r) => n + Number((r as { size_bytes: number }).size_bytes ?? 0),
    0,
  );

  const commentsSeries = bucketByDay(
    (commentRows ?? []).map((r) => (r as { created_at: string }).created_at),
    days,
  );

  const spacesSeries = bucketByWeek(
    (spaceRows ?? []).map((r) => (r as { created_at: string }).created_at),
    Math.max(1, Math.ceil(days / 7)),
  );
  const terminalsSeries = bucketByWeek(
    (terminalRows ?? []).map((r) => (r as { created_at: string }).created_at),
    Math.max(1, Math.ceil(days / 7)),
  );

  const notifs = (notifRows ?? []) as Array<{
    created_at: string;
    read_at: string | null;
  }>;
  const sent = notifs.length;
  const read = notifs.filter((n) => n.read_at !== null).length;

  const retention = buildCohortRetention(
    (signupRows ?? []).map((r) => ({
      user_id: (r as { user_id: string }).user_id,
      created_at: (r as { created_at: string }).created_at,
    })),
    activity,
  );

  return {
    range: {
      since: since.toISOString(),
      until: until.toISOString(),
      days,
    },
    active_users: { dau, wau, mau },
    tasks_created: tasksSeries,
    files: { uploads: filesSeries, total_bytes: totalBytes },
    comments_posted: commentsSeries,
    spaces_per_week: spacesSeries,
    terminals_per_week: terminalsSeries,
    notifications: {
      sent,
      read,
      ratio: sent === 0 ? 0 : read / sent,
    },
    retention,
  };
}

// ----- helpers ------------------------------------------------------------

function distinctUsersInWindow(
  rows: Array<{ actor_id: string | null; created_at: string }>,
  windowDays: number,
): number {
  const cutoff = Date.now() - windowDays * 86_400_000;
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r.actor_id) continue;
    if (new Date(r.created_at).getTime() >= cutoff) seen.add(r.actor_id);
  }
  return seen.size;
}

function bucketByDay(timestamps: string[], days: number): TimeSeries {
  const counts = new Map<string, number>();
  // Pre-seed every day in the window with 0 so the sparkline has a
  // continuous x-axis (no gaps from quiet days).
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86_400_000);
    counts.set(isoDate(d), 0);
  }
  for (const ts of timestamps) {
    const key = ts.slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const buckets = Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
  const total = buckets.reduce((n, b) => n + b.value, 0);
  return { buckets, total };
}

function bucketByWeek(timestamps: string[], weeks: number): TimeSeries {
  const counts = new Map<string, number>();
  const base = mondayUTC(new Date());
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 7 * 86_400_000);
    counts.set(isoDate(d), 0);
  }
  for (const ts of timestamps) {
    const key = isoDate(mondayUTC(new Date(ts)));
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const buckets = Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value }));
  const total = buckets.reduce((n, b) => n + b.value, 0);
  return { buckets, total };
}

function buildCohortRetention(
  signups: Array<{ user_id: string; created_at: string }>,
  activity: Array<{ actor_id: string | null; created_at: string }>,
): CohortRetention[] {
  const FOLLOWUP_WEEKS = 8;
  const cohortMap = new Map<string, Set<string>>(); // cohort_week -> user_ids
  const userCohort = new Map<string, string>(); // user_id -> cohort_week

  for (const s of signups) {
    const wk = isoDate(mondayUTC(new Date(s.created_at)));
    if (!cohortMap.has(wk)) cohortMap.set(wk, new Set());
    cohortMap.get(wk)!.add(s.user_id);
    userCohort.set(s.user_id, wk);
  }

  // For each cohort, count distinct active users by week-offset.
  const weekActive = new Map<string, Map<number, Set<string>>>(); // cohort_week -> wk_offset -> active users
  for (const a of activity) {
    if (!a.actor_id) continue;
    const cohort = userCohort.get(a.actor_id);
    if (!cohort) continue;
    const cohortMs = new Date(cohort).getTime();
    const offset = Math.floor(
      (mondayUTC(new Date(a.created_at)).getTime() - cohortMs) /
        (7 * 86_400_000),
    );
    if (offset < 0 || offset >= FOLLOWUP_WEEKS) continue;
    if (!weekActive.has(cohort)) weekActive.set(cohort, new Map());
    const m = weekActive.get(cohort)!;
    if (!m.has(offset)) m.set(offset, new Set());
    m.get(offset)!.add(a.actor_id);
  }

  const cohorts: CohortRetention[] = [];
  for (const [wk, users] of Array.from(cohortMap.entries()).sort()) {
    const size = users.size;
    if (size === 0) continue;
    const weekN: number[] = [];
    for (let i = 0; i < FOLLOWUP_WEEKS; i++) {
      const active = weekActive.get(wk)?.get(i)?.size ?? 0;
      weekN.push(size === 0 ? 0 : active / size);
    }
    cohorts.push({ cohort_week: wk, cohort_size: size, week_n: weekN });
  }
  return cohorts.slice(-8); // last 8 cohorts (~2 months)
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mondayUTC(d: Date): Date {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  // ISO week: Monday = 1, Sunday = 7. JS getUTCDay: Sunday = 0.
  const dow = x.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setUTCDate(x.getUTCDate() + offset);
  return x;
}

/*
  TODO: once daily activity exceeds ~100k rows, the unbounded SELECTs above
  start being expensive even with the 100k LIMIT (we'd be sampling not
  measuring). Materialize via a daily rollup job:
    - mv_metrics_daily(date, dau, tasks_created, files_uploaded, ...)
    - refresh nightly via pg_cron
    - rewrite this module to read from the rollup + only the most recent
      day from the live tables.
*/
