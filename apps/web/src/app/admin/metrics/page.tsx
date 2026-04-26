import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import {
  AdminBadge,
  AdminEmpty,
  AdminPanel,
  AdminSectionHeader,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";
import { Sparkline } from "@/components/admin/Sparkline";
import { loadMetrics, type MetricsData, type TimeSeries } from "./queries";

export const metadata = { title: "Metrics — Admin" };
export const dynamic = "force-dynamic";

const RANGES: Array<{ id: string; days: number; label: string }> = [
  { id: "7d", days: 7, label: "7d" },
  { id: "30d", days: 30, label: "30d" },
  { id: "90d", days: 90, label: "90d" },
];

export default async function AdminMetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const params = await searchParams;
  const range =
    RANGES.find((r) => r.id === params.range) ?? RANGES[1]!; // default 30d

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const data = await loadMetrics(admin, range.days);

  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Metrics"
        description="Read-only business metrics derived from the live tables. Cached per-request only."
        actions={
          <div
            className="flex items-center gap-1"
            role="tablist"
            aria-label="Time range"
          >
            {RANGES.map((r) => (
              <Link
                key={r.id}
                href={`/admin/metrics?range=${r.id}`}
                role="tab"
                aria-selected={r.id === range.id}
                className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wide ${
                  r.id === range.id
                    ? "border-accent bg-accent-subtle text-accent"
                    : "border-border bg-bg-2 text-text-2 hover:bg-bg-3"
                }`}
              >
                {r.label}
              </Link>
            ))}
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="DAU"
          value={data.active_users.dau}
          hint="distinct users with activity in last 24h"
        />
        <Stat
          label="WAU"
          value={data.active_users.wau}
          hint="distinct users in last 7d"
        />
        <Stat
          label="MAU"
          value={data.active_users.mau}
          hint="distinct users in last 30d"
        />
        <Stat
          label="Notif read rate"
          value={`${(data.notifications.ratio * 100).toFixed(1)}%`}
          hint={`${data.notifications.read.toLocaleString()} read of ${data.notifications.sent.toLocaleString()} sent`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SeriesCard
          title="Tasks created per day"
          series={data.tasks_created}
        />
        <SeriesCard
          title="Files uploaded per day"
          series={data.files.uploads}
          subtitle={`${prettyBytes(data.files.total_bytes)} uploaded in window`}
        />
        <SeriesCard
          title="Comments posted per day"
          series={data.comments_posted}
        />
        <SeriesCard
          title="Spaces + terminals per week"
          series={data.terminals_per_week}
          secondary={data.spaces_per_week}
          legendPrimary="terminals"
          legendSecondary="spaces"
        />
      </div>

      <CohortPanel data={data} />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded border border-border bg-bg-1 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-text-3">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl text-text-0">
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      {hint ? <div className="mt-1 text-[11px] text-text-3">{hint}</div> : null}
    </div>
  );
}

function SeriesCard({
  title,
  series,
  subtitle,
  secondary,
  legendPrimary,
  legendSecondary,
}: {
  title: string;
  series: TimeSeries;
  subtitle?: string;
  secondary?: TimeSeries;
  legendPrimary?: string;
  legendSecondary?: string;
}) {
  return (
    <AdminPanel title={title}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="font-display text-3xl text-text-0">
              {series.total.toLocaleString()}
            </div>
            {subtitle ? (
              <div className="mt-1 text-[11px] text-text-3">{subtitle}</div>
            ) : null}
            {legendPrimary || legendSecondary ? (
              <div className="mt-1 flex gap-3 text-[10px] text-text-3">
                {legendPrimary ? (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-0.5 w-3 bg-accent" />
                    {legendPrimary}: {series.total}
                  </span>
                ) : null}
                {legendSecondary && secondary ? (
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-0.5 w-3 bg-text-3" />
                    {legendSecondary}: {secondary.total}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col items-end">
            <Sparkline
              points={series.buckets.map((b) => b.value)}
              width={140}
              height={34}
              className="text-accent"
              ariaLabel={`${title} sparkline`}
            />
            {secondary ? (
              <Sparkline
                points={secondary.buckets.map((b) => b.value)}
                width={140}
                height={20}
                className="text-text-3"
                ariaLabel={`${title} secondary sparkline`}
              />
            ) : null}
          </div>
        </div>
      </div>
    </AdminPanel>
  );
}

function CohortPanel({ data }: { data: MetricsData }) {
  const FOLLOWUP_WEEKS = data.retention[0]?.week_n.length ?? 0;
  return (
    <AdminPanel title="Weekly signup-cohort retention (% of cohort active by week)">
      {data.retention.length === 0 ? (
        <AdminEmpty>
          No signups in the cohort window — retention requires at least one
          weekly cohort.
        </AdminEmpty>
      ) : (
        <AdminTable className="border-0">
          <thead>
            <tr className="border-b border-border bg-bg-2">
              <AdminTh>Cohort week</AdminTh>
              <AdminTh align="right">Size</AdminTh>
              {Array.from({ length: FOLLOWUP_WEEKS }).map((_, i) => (
                <AdminTh key={i} align="right">
                  W{i}
                </AdminTh>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.retention.map((c) => (
              <tr key={c.cohort_week}>
                <AdminTd mono>{c.cohort_week}</AdminTd>
                <AdminTd align="right" mono>
                  {c.cohort_size.toLocaleString()}
                </AdminTd>
                {c.week_n.map((pct, i) => (
                  <AdminTd key={i} align="right" mono>
                    <RetentionCell pct={pct} />
                  </AdminTd>
                ))}
              </tr>
            ))}
          </tbody>
        </AdminTable>
      )}
    </AdminPanel>
  );
}

function RetentionCell({ pct }: { pct: number }) {
  if (pct === 0) return <span className="text-text-3">—</span>;
  const variant: "muted" | "accent" | "success" =
    pct >= 0.5 ? "success" : pct >= 0.2 ? "accent" : "muted";
  return <AdminBadge variant={variant}>{(pct * 100).toFixed(0)}%</AdminBadge>;
}

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
