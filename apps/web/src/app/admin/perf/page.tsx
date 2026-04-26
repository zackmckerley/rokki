import { AdminSectionHeader } from "@/components/admin/primitives";
import { PerfClient } from "./PerfClient";

export const metadata = { title: "Performance — Admin" };
export const dynamic = "force-dynamic";

/**
 * Slow-query observability dashboard. Reads from `pg_stat_statements`
 * via the `get_slow_queries` RPC. Pure server shell — the table itself
 * lives in the client component so column-sort and modal interactions
 * don't roundtrip.
 *
 * NOTE on merge: when the admin-mobile branch lands, its extracted
 * `nav-items.tsx` source needs an "Operations -> Performance" entry
 * pointing at /admin/perf. Until then this nav-item is wired in
 * `apps/web/src/app/admin/layout.tsx` directly.
 */
export default function AdminPerfPage() {
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Performance"
        description="pg_stat_statements snapshot. Top 50 queries by mean execution time."
      />
      <PerfClient />
    </div>
  );
}
