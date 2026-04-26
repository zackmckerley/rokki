import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database, ProjectStatus } from "@rokki/db";

export const metadata = { title: "Terminals — Admin" };
export const dynamic = "force-dynamic";

interface TerminalRow {
  id: string;
  ticker: string;
  name: string;
  status: ProjectStatus;
  space_id: string;
  created_at: string;
  archived_at: string | null;
  spaces: { slug: string; name: string } | null;
}

/**
 * Admin list of every terminal — archived included, filterable by status.
 */
export default async function AdminTerminalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const filter = params.status;

  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let query = admin
    .from("terminals")
    .select(
      "id, ticker, name, status, space_id, created_at, archived_at, spaces(slug, name)",
    )
    .order("created_at", { ascending: false });
  if (filter === "archived") query = query.not("archived_at", "is", null);
  else if (filter)
    query = query
      .eq("status", filter as ProjectStatus)
      .is("archived_at", null);
  else query = query.is("archived_at", null);

  const { data } = await query;
  const rows = (data ?? []) as unknown as TerminalRow[];

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-0">Terminals</h1>
          <p className="mt-1 text-xs text-text-3">
            {rows.length} terminal{rows.length === 1 ? "" : "s"}
            {filter ? ` · filter: ${filter}` : ""}
          </p>
        </div>
        <nav className="flex flex-wrap gap-1 text-xs">
          <FilterLink current={filter} value={undefined}>
            Active
          </FilterLink>
          {(["planning", "active", "blocked", "done"] as const).map((s) => (
            <FilterLink key={s} current={filter} value={s}>
              {s}
            </FilterLink>
          ))}
          <FilterLink current={filter} value="archived">
            Archived
          </FilterLink>
        </nav>
      </header>

      <div className="overflow-hidden rounded border border-border bg-bg-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
              <th className="px-3 py-2 text-left font-semibold">Ticker</th>
              <th className="px-3 py-2 text-left font-semibold">Name</th>
              <th className="px-3 py-2 text-left font-semibold">Space</th>
              <th className="px-3 py-2 text-left font-semibold">Status</th>
              <th className="px-3 py-2 text-left font-semibold">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-bg-2">
                <td className="px-3 py-2 font-mono text-xs text-accent">
                  <Link
                    href={`/admin/terminals/${t.ticker}`}
                    className="hover:underline"
                  >
                    {t.ticker}
                  </Link>
                </td>
                <td className="px-3 py-2 text-text-0">
                  <Link
                    href={`/admin/terminals/${t.ticker}`}
                    className="text-text-0 hover:text-accent"
                  >
                    {t.name}
                  </Link>
                </td>
                <td className="px-3 py-2 text-xs text-text-2">
                  {t.spaces ? (
                    <Link
                      href={`/admin/spaces/${t.spaces.slug}`}
                      className="text-text-2 hover:text-accent"
                    >
                      {t.spaces.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-[10px] uppercase text-text-3">
                  {t.archived_at ? "archived" : t.status}
                </td>
                <td className="px-3 py-2 text-xs text-text-3">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-xs text-text-3"
                >
                  No terminals match this filter.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FilterLink({
  current,
  value,
  children,
}: {
  current?: string;
  value?: string;
  children: React.ReactNode;
}) {
  const active = (current ?? "") === (value ?? "");
  const href = value ? `/admin/terminals?status=${value}` : "/admin/terminals";
  return (
    <Link
      href={href}
      className={`rounded-sm border px-2 py-0.5 font-mono uppercase tracking-wide ${
        active
          ? "border-accent bg-accent-subtle text-text-0"
          : "border-border bg-bg-2 text-text-2 hover:bg-bg-3"
      }`}
    >
      {children}
    </Link>
  );
}
