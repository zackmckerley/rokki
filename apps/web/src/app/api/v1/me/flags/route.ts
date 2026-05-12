import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

import { withObservability } from "@/lib/observability";
/**
 * GET /api/v1/me/flags
 *   Returns a `{ key: value }` map for the current user, resolving
 *   precedence:
 *     user override > space override (any space they're in) > global
 *
 *   Rollout percentage is applied at this layer using a stable hash
 *   of (user_id + key) so a user always gets the same answer.
 */
async function handleGet() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { errors: [{ code: "unauthenticated", message: "Sign in required" }] },
      { status: 401 },
    );

  const { data: spaces } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("user_id", user.id);
  const spaceIds = ((spaces ?? []) as { space_id: string }[]).map(
    (s) => s.space_id,
  );

  const { data: flags } = await supabase
    .from("feature_flags")
    .select("key, scope, scope_id, value, rollout_percentage");

  const rows = (flags ?? []) as Array<{
    key: string;
    scope: "global" | "space" | "user";
    scope_id: string | null;
    value: unknown;
    rollout_percentage: number;
  }>;

  // Bucket per key.
  const byKey = new Map<
    string,
    Array<typeof rows[number]>
  >();
  for (const r of rows) {
    if (
      r.scope === "user" &&
      r.scope_id !== user.id
    )
      continue;
    if (
      r.scope === "space" &&
      (!r.scope_id || !spaceIds.includes(r.scope_id))
    )
      continue;
    const cur = byKey.get(r.key) ?? [];
    cur.push(r);
    byKey.set(r.key, cur);
  }

  const out: Record<string, unknown> = {};
  for (const [key, candidates] of byKey.entries()) {
    // Highest precedence first.
    const sorted = candidates.sort((a, b) => rank(b.scope) - rank(a.scope));
    for (const cand of sorted) {
      const bucket = stableBucket(`${user.id}:${key}`);
      if (bucket < cand.rollout_percentage) {
        out[key] = cand.value;
        break;
      }
    }
  }

  return NextResponse.json({ data: out });
}

function rank(scope: "global" | "space" | "user"): number {
  return scope === "user" ? 3 : scope === "space" ? 2 : 1;
}

function stableBucket(seed: string): number {
  // FNV-1a 32-bit hash → 0-99
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h % 100;
}

export const GET = withObservability(
  handleGet,
  "GET /api/v1/me/flags",
);
