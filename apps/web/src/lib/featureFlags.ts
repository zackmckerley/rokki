/**
 * Server-side feature-flag resolution.
 *
 * For client code, use the `useFlag` hook from `@/lib/flags` — it
 * fetches the same flag map via `/api/v1/me/flags` and caches per-tab.
 * This module is the SSR / server-action / route-handler equivalent:
 * read a single flag value with one DB hit using the same precedence
 * rules (user override > space override > global).
 *
 * Precedence and rollout matching mirror `/api/v1/me/flags` exactly,
 * so a flag flipped on for a user via the API responds identically to
 * the equivalent server-side check.
 */
import { createClient } from "@/lib/supabase/server";

type FlagScope = "global" | "space" | "user";

interface FlagRow {
  key: string;
  scope: FlagScope;
  scope_id: string | null;
  value: unknown;
  rollout_percentage: number;
}

/**
 * Resolve `pane_shell_enabled` for the given user. Returns `false`
 * when no flag row matches or the rollout bucket excludes this user.
 *
 * Reads:
 *   - feature_flags (RLS: every authenticated user can read)
 *   - space_members (to resolve space-scoped flags for the caller)
 *
 * Cost: 2 round-trips per call. Cache at the caller if you need to
 * gate many components — a single resolution per request is fine.
 */
export async function paneShellEnabled(userId: string): Promise<boolean> {
  const v = await readBooleanFlag(userId, "pane_shell_enabled");
  return v ?? false;
}

/**
 * Generic helper — read a boolean-valued flag for the current
 * server-rendered request. Returns `null` if no row matches (so the
 * caller can distinguish "explicitly false" from "no flag exists").
 *
 * Use the typed helpers above for known flag keys; this lower-level
 * one exists so we don't have to write a new function per flag.
 */
export async function readBooleanFlag(
  userId: string,
  key: string,
): Promise<boolean | null> {
  const supabase = await createClient();

  // 1. Pull every row for this key. The flag-row count per key is
  //    small (global + maybe per-space + maybe per-user); filtering
  //    here is fine.
  const { data: flagRows } = await supabase
    .from("feature_flags")
    .select("key, scope, scope_id, value, rollout_percentage")
    .eq("key", key);
  const rows = (flagRows ?? []) as FlagRow[];
  if (rows.length === 0) return null;

  // 2. Resolve which space scopes apply to this viewer.
  const { data: memberships } = await supabase
    .from("space_members")
    .select("space_id")
    .eq("user_id", userId);
  const spaceIds = ((memberships ?? []) as { space_id: string }[]).map(
    (r) => r.space_id,
  );

  // 3. Filter candidates the caller can see.
  const candidates = rows.filter((r) => {
    if (r.scope === "user") return r.scope_id === userId;
    if (r.scope === "space") return r.scope_id && spaceIds.includes(r.scope_id);
    return true; // global
  });
  if (candidates.length === 0) return null;

  // 4. Highest-precedence candidate that passes the rollout bucket
  //    wins. Same algorithm as /api/v1/me/flags so client + server
  //    agree on the same answer.
  candidates.sort((a, b) => rank(b.scope) - rank(a.scope));
  for (const cand of candidates) {
    const bucket = stableBucket(`${userId}:${key}`);
    if (bucket < cand.rollout_percentage) {
      if (typeof cand.value === "boolean") return cand.value;
      // JSON `true` / `false` may arrive as the literal strings on
      // some configurations — coerce defensively.
      if (cand.value === "true") return true;
      if (cand.value === "false") return false;
      return null;
    }
  }
  return null;
}

function rank(scope: FlagScope): number {
  return scope === "user" ? 3 : scope === "space" ? 2 : 1;
}

/**
 * FNV-1a 32-bit hash → 0..99 bucket. Matches the bucket function in
 * `/api/v1/me/flags` so a user assigned to bucket N by one path lands
 * in the same bucket on the other.
 */
function stableBucket(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h % 100;
}
