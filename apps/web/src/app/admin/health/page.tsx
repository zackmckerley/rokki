import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import {
  AdminEmpty,
  AdminPanel,
  AdminSectionHeader,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";

export const metadata = { title: "Health — Admin" };
export const dynamic = "force-dynamic";

const TABLES = [
  "profiles",
  "spaces",
  "terminals",
  "tasks",
  "files",
  "tools",
  "tool_invocations",
  "messages",
  "domain_events",
  "activity",
  "rate_limit_hits",
  "session_revocations",
  "feature_flags",
  "announcements",
  "webhook_destinations",
  "webhook_deliveries",
] as const;

export default async function AdminHealthPage() {
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const counts = await Promise.all(
    TABLES.map(async (t) => {
      const { count } = await admin
        .from(t as never)
        .select("*", { count: "exact", head: true });
      return { table: t, count: count ?? 0 };
    }),
  );

  const [{ count: pendingScan }, { count: infected }, { count: pendingApprovals }] =
    await Promise.all([
      admin
        .from("files")
        .select("id", { count: "exact", head: true })
        .eq("virus_scan_status", "pending"),
      admin
        .from("files")
        .select("id", { count: "exact", head: true })
        .eq("virus_scan_status", "infected"),
      admin
        .from("approvals")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);

  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Health"
        description="Row counts across the public schema and current queue depth."
      />

      <AdminPanel title="Queues">
        <AdminTable className="border-0">
          <thead>
            <tr className="border-b border-border bg-bg-2">
              <AdminTh>Queue</AdminTh>
              <AdminTh align="right">Depth</AdminTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <Q label="Files awaiting virus scan" count={pendingScan ?? 0} />
            <Q label="Files flagged infected" count={infected ?? 0} />
            <Q label="Approvals awaiting decision" count={pendingApprovals ?? 0} />
          </tbody>
        </AdminTable>
      </AdminPanel>

      <AdminPanel title="Row counts">
        {counts.length === 0 ? (
          <AdminEmpty>Nothing.</AdminEmpty>
        ) : (
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Table</AdminTh>
                <AdminTh align="right">Rows</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {counts.map((c) => (
                <tr key={c.table}>
                  <AdminTd mono>{c.table}</AdminTd>
                  <AdminTd align="right" mono>
                    {c.count.toLocaleString()}
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>
    </div>
  );
}

function Q({ label, count }: { label: string; count: number }) {
  return (
    <tr>
      <AdminTd>{label}</AdminTd>
      <AdminTd align="right" mono>
        {count.toLocaleString()}
      </AdminTd>
    </tr>
  );
}
