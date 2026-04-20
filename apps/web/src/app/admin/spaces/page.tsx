import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";

export const metadata = { title: "Spaces — Admin" };
export const dynamic = "force-dynamic";

interface SpaceRow {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  created_by: string;
}

/**
 * Admin list of every space. For each: member count, terminal count,
 * and a link to the space's own settings page.
 */
export default async function AdminSpacesPage() {
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: spaces } = await admin
    .from("spaces")
    .select("id, slug, name, created_at, created_by")
    .order("created_at", { ascending: false });

  const rows = (spaces ?? []) as SpaceRow[];
  const ids = rows.map((s) => s.id);

  // Aggregate counts in two group queries instead of one-per-space.
  const [memberCounts, terminalCounts] = await Promise.all([
    countByGroup(
      admin.from("space_members").select("space_id").in("space_id", ids),
      "space_id",
    ),
    countByGroup(
      admin
        .from("terminals")
        .select("space_id")
        .is("archived_at", null)
        .in("space_id", ids),
      "space_id",
    ),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-text-0">Spaces</h1>
        <p className="mt-1 text-xs text-text-3">
          {rows.length} space{rows.length === 1 ? "" : "s"}. Click a row to open
          its settings.
        </p>
      </header>

      <div className="overflow-hidden rounded border border-border bg-bg-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
              <th className="px-3 py-2 text-left font-semibold">Name</th>
              <th className="px-3 py-2 text-left font-semibold">Slug</th>
              <th className="px-3 py-2 text-right font-semibold">Members</th>
              <th className="px-3 py-2 text-right font-semibold">Terminals</th>
              <th className="px-3 py-2 text-left font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-bg-2">
                <td className="px-3 py-2">
                  <Link
                    href={`/s/${s.slug}/settings`}
                    className="text-text-0 hover:text-accent"
                  >
                    {s.name}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-text-2">
                  {s.slug}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-1">
                  {memberCounts.get(s.id) ?? 0}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-1">
                  {terminalCounts.get(s.id) ?? 0}
                </td>
                <td className="px-3 py-2 text-xs text-text-3">
                  {new Date(s.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-xs text-text-3"
                >
                  No spaces yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function countByGroup<T extends Record<string, unknown>>(
  query: PromiseLike<{ data: T[] | null }>,
  key: keyof T,
): Promise<Map<string, number>> {
  const { data } = await query;
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    const id = String(row[key]);
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}
