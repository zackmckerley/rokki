import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";

export const metadata = { title: "Revocations — Admin" };
export const dynamic = "force-dynamic";

interface Row {
  id: number;
  user_id: string;
  reason: string;
  scope_type: string | null;
  scope_id: string | null;
  created_at: string;
}

export default async function AdminRevocationsPage() {
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // `session_revocations` was added in a recent migration that isn't in
  // the generated types yet. Cast loosely so we can read it now.
  const { data } = await (admin.from(
    "session_revocations" as never,
  ) as unknown as {
    select: (cols: string) => {
      order: (
        col: string,
        opts: { ascending: boolean },
      ) => {
        limit: (
          n: number,
        ) => Promise<{ data: Row[] | null; error: { message: string } | null }>;
      };
    };
  })
    .select("id, user_id, reason, scope_type, scope_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-text-0">Revocations</h1>
        <p className="mt-1 text-xs text-text-3">
          Forced sign-out events. Rows older than 7 days are pruned
          automatically.
        </p>
      </header>

      <div className="overflow-hidden rounded border border-border bg-bg-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
              <th className="px-3 py-2 text-left font-semibold">When</th>
              <th className="px-3 py-2 text-left font-semibold">User</th>
              <th className="px-3 py-2 text-left font-semibold">Reason</th>
              <th className="px-3 py-2 text-left font-semibold">Scope</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-mono text-[11px] text-text-3">
                  {new Date(r.created_at).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-text-2">
                  <Link
                    href={`/admin/users/${r.user_id}`}
                    className="hover:text-accent"
                  >
                    {r.user_id.slice(0, 12)}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-accent">
                  {r.reason}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-text-3">
                  {r.scope_type
                    ? `${r.scope_type}: ${r.scope_id?.slice(0, 8) ?? "—"}`
                    : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-6 text-center text-xs text-text-3"
                >
                  No revocations recorded.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
