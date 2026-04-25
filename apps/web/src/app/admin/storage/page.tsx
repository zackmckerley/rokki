import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import {
  AdminBadge,
  AdminEmpty,
  AdminPanel,
  AdminSectionHeader,
  AdminTable,
  AdminTd,
  AdminTh,
} from "@/components/admin/primitives";
import { StorageOps } from "./StorageOps";

export const metadata = { title: "Storage — Admin" };
export const dynamic = "force-dynamic";

interface SpaceRollup {
  space_id: string;
  bytes: number;
  files: number;
  slug: string | null;
  name: string | null;
}
interface LargestFile {
  id: string;
  filename: string;
  size_bytes: number;
  uploaded_at: string;
  terminals: { ticker: string; name: string; space_id: string } | null;
}

export default async function AdminStoragePage() {
  const admin = createAdminClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: largest } = await admin
    .from("files")
    .select(
      "id, filename, size_bytes, uploaded_at, terminals(ticker, name, space_id)",
    )
    .is("deleted_at", null)
    .order("size_bytes", { ascending: false })
    .limit(50);

  const { data: bySpaceRaw } = await admin
    .from("files")
    .select("size_bytes, terminals(space_id)")
    .is("deleted_at", null);

  const bySpace = new Map<
    string,
    { space_id: string; bytes: number; files: number }
  >();
  for (const r of (bySpaceRaw ?? []) as Array<{
    size_bytes: number;
    terminals: { space_id: string } | null;
  }>) {
    const sid = r.terminals?.space_id;
    if (!sid) continue;
    const cur = bySpace.get(sid) ?? { space_id: sid, bytes: 0, files: 0 };
    cur.bytes += r.size_bytes ?? 0;
    cur.files += 1;
    bySpace.set(sid, cur);
  }
  const rollup = Array.from(bySpace.values()).sort((a, b) => b.bytes - a.bytes);
  const spaceIds = rollup.map((r) => r.space_id);
  const { data: spaces } = spaceIds.length
    ? await admin.from("spaces").select("id, slug, name").in("id", spaceIds)
    : { data: [] };
  const sm = new Map(
    ((spaces ?? []) as { id: string; slug: string; name: string }[]).map((s) => [
      s.id,
      s,
    ]),
  );
  const enrichedRollup: SpaceRollup[] = rollup.map((r) => ({
    ...r,
    slug: sm.get(r.space_id)?.slug ?? null,
    name: sm.get(r.space_id)?.name ?? null,
  }));

  return (
    <div className="flex flex-col gap-4">
      <AdminSectionHeader
        title="Storage"
        description="Storage usage by space, plus the 50 largest live files."
      />

      <StorageOps />

      <AdminPanel title="Usage by space">
        {enrichedRollup.length === 0 ? (
          <AdminEmpty>No live files.</AdminEmpty>
        ) : (
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>Space</AdminTh>
                <AdminTh align="right">Files</AdminTh>
                <AdminTh align="right">Total bytes</AdminTh>
                <AdminTh align="right">Pretty</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {enrichedRollup.map((r) => (
                <tr key={r.space_id}>
                  <AdminTd>{r.name ?? r.space_id.slice(0, 8)}</AdminTd>
                  <AdminTd align="right" mono>
                    {r.files.toLocaleString()}
                  </AdminTd>
                  <AdminTd align="right" mono>
                    {r.bytes.toLocaleString()}
                  </AdminTd>
                  <AdminTd align="right">
                    <AdminBadge>{prettyBytes(r.bytes)}</AdminBadge>
                  </AdminTd>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </AdminPanel>

      <AdminPanel title="Largest files (top 50)">
        {!largest || largest.length === 0 ? (
          <AdminEmpty>None.</AdminEmpty>
        ) : (
          <AdminTable className="border-0">
            <thead>
              <tr className="border-b border-border bg-bg-2">
                <AdminTh>File</AdminTh>
                <AdminTh>Terminal</AdminTh>
                <AdminTh align="right">Size</AdminTh>
                <AdminTh>Uploaded</AdminTh>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(largest as unknown as LargestFile[]).map((f) => (
                <tr key={f.id}>
                  <AdminTd>{f.filename}</AdminTd>
                  <AdminTd mono>{f.terminals?.ticker ?? "—"}</AdminTd>
                  <AdminTd align="right" mono>
                    {prettyBytes(f.size_bytes)}
                  </AdminTd>
                  <AdminTd>
                    <span className="text-xs text-text-3">
                      {new Date(f.uploaded_at).toLocaleString()}
                    </span>
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

function prettyBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
