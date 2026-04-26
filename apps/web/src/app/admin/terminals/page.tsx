import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database, ProjectStatus } from "@rokki/db";
import {
  AdminTerminalsClient,
  type TerminalRow,
} from "./AdminTerminalsClient";

export const metadata = { title: "Terminals — Admin" };
export const dynamic = "force-dynamic";

interface DbRow {
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
 * Status filter lives in URL params (`?status=`); rendered table sort/filter
 * lives in `AdminTerminalsClient` and uses `?sort=&dir=`.
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
  const dbRows = (data ?? []) as unknown as DbRow[];

  const rows: TerminalRow[] = dbRows.map((t) => ({
    id: t.id,
    ticker: t.ticker,
    name: t.name,
    status: t.status,
    archived_at: t.archived_at,
    created_at: t.created_at,
    space_slug: t.spaces?.slug ?? null,
    space_name: t.spaces?.name ?? null,
  }));

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

      <AdminTerminalsClient rows={rows} />
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
