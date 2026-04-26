import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { ActivityRowsTable, type AdminActivityRow } from "./ActivityRowsTable";

export const metadata = { title: "Activity — Admin" };
export const dynamic = "force-dynamic";

/**
 * Admin activity log. Reads from the `activity` table directly — every
 * user-facing action writes one row; trigger-emitted UPDATE diffs surface
 * with their `before_json` / `after_json` payload visible inline. Click a
 * row to expand the per-field diff. Paginated via ?before= timestamp.
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

  // The `before_json` / `after_json` columns exist in the DB (migration
  // 20260427050000_activity_diffs.sql) but the generated types are not
  // regenerated until `supabase gen types` runs against the local DB.
  // Cast through `unknown` so the build doesn't depend on regen.
  let query = admin
    .from("activity")
    .select(
      "id, action, entity_type, entity_id, actor_id, terminal_id, space_id, metadata, before_json, after_json, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(PAGE);
  if (params.before) query = query.lt("created_at", params.before);

  const { data } = await query;
  const rows = ((data ?? []) as unknown) as AdminActivityRow[];

  const next =
    rows.length === PAGE ? rows[rows.length - 1]!.created_at : undefined;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-text-0">Activity</h1>
        <p className="mt-1 text-xs text-text-3">
          Every state transition across the platform. Latest first. Rows with
          a diff icon expand to a field-by-field before/after view.
        </p>
      </header>

      <ActivityRowsTable rows={rows} />

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
