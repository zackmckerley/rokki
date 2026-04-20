import Link from "next/link";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { ShieldAlert } from "lucide-react";
import type { Database } from "@rokki/db";

export const metadata = { title: "Infected files — Admin" };
export const dynamic = "force-dynamic";

interface Row {
  id: string;
  filename: string;
  size_bytes: number;
  terminal_id: string;
  uploaded_at: string;
  uploaded_by: string;
  virus_scan_result: string | null;
  terminals: { ticker: string; name: string; space_id: string } | null;
}

/**
 * ClamAV-flagged files. Read-only audit — we don't auto-delete since
 * an admin might want to copy the bytes to an isolated environment for
 * analysis.
 */
export default async function AdminInfectedPage() {
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data } = await admin
    .from("files")
    .select(
      "id, filename, size_bytes, terminal_id, uploaded_at, uploaded_by, virus_scan_result, terminals(ticker, name, space_id)",
    )
    .eq("virus_scan_status", "infected")
    .is("deleted_at", null)
    .order("uploaded_at", { ascending: false });

  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="flex items-center gap-2 text-xl font-semibold text-text-0">
          <ShieldAlert className="h-5 w-5 text-danger" />
          Infected files
        </h1>
        <p className="mt-1 text-xs text-text-3">
          Files ClamAV flagged. Downloads are blocked; review and either
          delete or clear the flag manually via SQL.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded border border-success/30 bg-success-subtle/50 px-4 py-6 text-center text-sm text-success">
          No infected files detected.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-border bg-bg-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-bg-2 text-[10px] uppercase tracking-wide text-text-3">
                <th className="px-3 py-2 text-left font-semibold">File</th>
                <th className="px-3 py-2 text-left font-semibold">Terminal</th>
                <th className="px-3 py-2 text-left font-semibold">Signature</th>
                <th className="px-3 py-2 text-left font-semibold">Uploaded</th>
                <th className="px-3 py-2 text-left font-semibold">Uploader</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 text-text-0">{r.filename}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.terminals ? (
                      <Link
                        href={`/p/${r.terminals.ticker}`}
                        className="text-accent hover:underline"
                      >
                        {r.terminals.ticker}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-danger">
                    {r.virus_scan_result ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-xs text-text-3">
                    {new Date(r.uploaded_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-text-3">
                    {r.uploaded_by.slice(0, 12)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
