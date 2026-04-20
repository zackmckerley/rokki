// Loose client type — avoids friction between the cookie-based SSR client
// and the service-role client. Both work the same for our queries.
type AnySupabaseClient = {
  from: (table: string) => any;
};

export interface QuotaCheckResult {
  ok: boolean;
  /** Remaining credits before the call, if quotas apply. */
  remaining?: number;
  /** ISO date when the quota resets. */
  resets_at?: string;
}

/**
 * Check a user's per-tool quota before invoking. The rule: if the user (or
 * their active space) has any row in `quotas` for this tool + the current
 * period ('day'|'month'), the sum of used_credits plus `cost_credits` must
 * not exceed `limit_credits`.
 *
 * No row → no quota configured → allow. Deployments that want a hard cap
 * insert default rows via a seed or admin action.
 */
export async function checkQuota(
  supabase: AnySupabaseClient,
  opts: {
    userId: string;
    toolId: string;
    costCredits: number;
  },
): Promise<QuotaCheckResult> {
  const { data } = await supabase
    .from("quotas")
    .select("id, limit_credits, used_credits, reset_at, period, subject_type")
    .eq("subject_type", "user")
    .eq("subject_id", opts.userId)
    .eq("tool_id", opts.toolId)
    .order("reset_at", { ascending: true });

  const rows = (data ?? []) as Array<{
    id: string;
    limit_credits: number;
    used_credits: number;
    reset_at: string;
    period: "day" | "month";
  }>;

  if (rows.length === 0) return { ok: true };

  // If any row is over, deny. We expect at most one daily + one monthly.
  for (const q of rows) {
    const remaining = q.limit_credits - q.used_credits - opts.costCredits;
    if (remaining < 0) {
      return { ok: false, remaining: 0, resets_at: q.reset_at };
    }
  }

  return { ok: true };
}

/**
 * Increment usage by `costCredits` after a successful invocation.
 */
export async function recordQuotaUsage(
  supabase: AnySupabaseClient,
  opts: {
    userId: string;
    toolId: string;
    costCredits: number;
  },
): Promise<void> {
  if (opts.costCredits <= 0) return;
  const { data } = await supabase
    .from("quotas")
    .select("id, used_credits")
    .eq("subject_type", "user")
    .eq("subject_id", opts.userId)
    .eq("tool_id", opts.toolId);

  for (const row of (data ?? []) as Array<{ id: string; used_credits: number }>) {
    await supabase
      .from("quotas")
      .update({
        used_credits: row.used_credits + opts.costCredits,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
  }
}
