import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * GET /api/v1/admin/storage
 *   Returns:
 *     - by_space: storage rollup keyed by space
 *     - largest:  top 50 files by size_bytes (live + trash)
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const { data: largest } = await admin
    .from("files")
    .select(
      "id, filename, size_bytes, terminal_id, uploaded_at, deleted_at, terminals(ticker, name, space_id)",
    )
    .is("deleted_at", null)
    .order("size_bytes", { ascending: false })
    .limit(50);

  // Aggregate by space via the joined terminal.
  const { data: bySpaceRaw } = await admin
    .from("files")
    .select("size_bytes, terminals(space_id)")
    .is("deleted_at", null);

  const bySpace = new Map<string, { space_id: string; bytes: number; files: number }>();
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

  // Hydrate space names.
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

  return NextResponse.json({
    data: {
      by_space: rollup.map((r) => ({
        ...r,
        slug: sm.get(r.space_id)?.slug ?? null,
        name: sm.get(r.space_id)?.name ?? null,
      })),
      largest: largest ?? [],
    },
  });
}
