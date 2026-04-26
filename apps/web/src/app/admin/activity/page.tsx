import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { AdminActivityTable, type ActivityRow } from "./AdminActivityTable";

export const metadata = { title: "Activity — Admin" };
export const dynamic = "force-dynamic";

/**
 * Admin activity log. Reads from the `activity` table directly — every
 * user-facing action writes one row. Paginated via ?before= timestamp.
 * Sort + visible-row filter live in `AdminActivityTable` (URL `?sort=&dir=`).
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
  const rows = (data ?? []) as ActivityRow[];

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

      <AdminActivityTable rows={rows} />

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
