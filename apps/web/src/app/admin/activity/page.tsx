import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";

export const metadata = { title: "Activity — Admin" };
export const dynamic = "force-dynamic";

interface Row {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  actor_id: string | null;
  terminal_id: string | null;
  space_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Admin activity log. Reads from the `activity` table directly — every
 * user-facing action writes one row. Paginated via ?before= timestamp.
 */
export default async function AdminActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const params = await searchParams;
  const PAGE = 50;

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

  const { data } = await query;
  const rows = (data ?? []) as Row[];

  const next =
    rows.length === PAGE ? rows[rows.length - 1]!.created_at : undefined;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-text-0">Activity</h1>
        <p className="mt-1 text-xs text-text-3">
          Every state transition across the platform. Latest first.
        </p>
      </header>

      <div className="overflow-hidden rounded border border-border bg-bg-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
              <th className="px-3 py-2 text-left font-semibold">When</th>
              <th className="px-3 py-2 text-left font-semibold">Action</th>
              <th className="px-3 py-2 text-left font-semibold">Entity</th>
              <th className="px-3 py-2 text-left font-semibold">Actor</th>
              <th className="px-3 py-2 text-left font-semibold">Metadata</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-1.5 font-mono text-[11px] text-text-3">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-1.5 font-mono text-xs text-accent">
                  {r.action}
                </td>
                <td className="px-3 py-1.5 text-xs text-text-2">
                  {r.entity_type ?? "—"}
                  {r.entity_id ? (
                    <span className="ml-1 font-mono text-[10px] text-text-3">
                      {r.entity_id.slice(0, 8)}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5 font-mono text-[10px] text-text-3">
                  {r.actor_id?.slice(0, 8) ?? "system"}
                </td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-text-3">
                  <code className="truncate">
                    {JSON.stringify(r.metadata).slice(0, 100)}
                  </code>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-xs text-text-3"
                >
                  No activity.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {next ? (
        <div>
          <Link
            href={`/admin/activity?before=${encodeURIComponent(next)}`}
            className="text-xs text-accent hover:underline"
          >
            Older →
          </Link>
        </div>
      ) : null}
    </div>
  );
}
