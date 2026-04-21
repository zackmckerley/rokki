import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { emitEvent } from "@/lib/events";

/**
 * GET /api/v1/admin/rate-limits
 *   ?bucket=  filter by bucket name
 *   ?token=   filter by token (email/ip)
 *   ?since=   ISO timestamp; default last 1h
 *
 * DELETE /api/v1/admin/rate-limits?bucket=...&token=...
 *   Flushes hits matching the predicate (so a stuck user can sign in again).
 */
export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const bucket = url.searchParams.get("bucket")?.trim();
  const token = url.searchParams.get("token")?.trim();
  const since =
    url.searchParams.get("since") ??
    new Date(Date.now() - 60 * 60 * 1000).toISOString();

  let query = admin
    .from("rate_limit_hits")
    .select("id, bucket, token, ts")
    .gt("ts", since)
    .order("ts", { ascending: false })
    .limit(2000);
  if (bucket) query = query.eq("bucket", bucket);
  if (token) query = query.eq("token", token);

  const { data, error } = await query;
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  // Aggregate by (bucket, token) for the table view.
  const buckets = new Map<
    string,
    { bucket: string; token: string; count: number; latest: string }
  >();
  for (const row of (data ?? []) as Array<{
    bucket: string;
    token: string;
    ts: string;
  }>) {
    const key = `${row.bucket}|${row.token}`;
    const cur = buckets.get(key);
    if (cur) {
      cur.count += 1;
      if (row.ts > cur.latest) cur.latest = row.ts;
    } else {
      buckets.set(key, {
        bucket: row.bucket,
        token: row.token,
        count: 1,
        latest: row.ts,
      });
    }
  }
  const rolledUp = Array.from(buckets.values()).sort(
    (a, b) => b.count - a.count,
  );

  return NextResponse.json({ data: rolledUp, meta: { total_hits: data?.length ?? 0 } });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin, userId: actorId } = gate;

  const url = new URL(request.url);
  const bucket = url.searchParams.get("bucket")?.trim();
  const token = url.searchParams.get("token")?.trim();
  if (!bucket || !token)
    return NextResponse.json(
      {
        errors: [
          {
            code: "invalid_request",
            message: "bucket + token query params required",
          },
        ],
      },
      { status: 400 },
    );

  const { error } = await admin
    .from("rate_limit_hits")
    .delete()
    .eq("bucket", bucket)
    .eq("token", token);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  void emitEvent("admin.rate_limit.flushed", {
    actor_id: actorId,
    entity_type: "rate_limit",
    payload: { bucket, token },
  });

  return new NextResponse(null, { status: 204 });
}
