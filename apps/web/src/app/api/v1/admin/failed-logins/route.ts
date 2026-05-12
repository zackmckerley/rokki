import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

import { withObservability } from "@/lib/observability";
/**
 * GET /api/v1/admin/failed-logins
 *   Aggregates rate_limit_hits in the password_login + magic_link_email
 *   buckets to surface accounts under attempted abuse. Each row is one
 *   (token, attempt-count) pair where the token is "ip:email".
 */
async function handleGet(request: NextRequest) {
  const gate = await requireAdmin(request);
  if ("status" in gate) return gate;
  const { admin } = gate;

  const url = new URL(request.url);
  const sinceMins = parseInt(url.searchParams.get("since_mins") ?? "1440", 10);
  const since = new Date(Date.now() - sinceMins * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("rate_limit_hits")
    .select("bucket, token, ts")
    .in("bucket", ["password_login", "magic_link_email"])
    .gt("ts", since)
    .order("ts", { ascending: false })
    .limit(5000);
  if (error)
    return NextResponse.json(
      { errors: [{ code: "internal_error", message: error.message }] },
      { status: 500 },
    );

  const buckets = new Map<
    string,
    { token: string; password_attempts: number; magic_attempts: number; latest: string }
  >();
  for (const row of (data ?? []) as Array<{
    bucket: string;
    token: string;
    ts: string;
  }>) {
    const cur = buckets.get(row.token) ?? {
      token: row.token,
      password_attempts: 0,
      magic_attempts: 0,
      latest: row.ts,
    };
    if (row.bucket === "password_login") cur.password_attempts += 1;
    else cur.magic_attempts += 1;
    if (row.ts > cur.latest) cur.latest = row.ts;
    buckets.set(row.token, cur);
  }

  return NextResponse.json({
    data: Array.from(buckets.values()).sort(
      (a, b) =>
        b.password_attempts +
        b.magic_attempts -
        (a.password_attempts + a.magic_attempts),
    ),
    meta: { since },
  });
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/admin/failed-logins",
);
