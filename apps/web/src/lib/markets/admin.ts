/**
 * Lazy service-role Supabase client for system-level markets operations.
 *
 * Used ONLY for non-user-initiated writes that legitimately need to bypass
 * RLS: filling the public `mkt_quote_cache` from the server-side fetch layer,
 * and the cron alert evaluator firing `notifications`. All user-initiated
 * watchlist/portfolio/alert CRUD goes through the per-user RLS client
 * (`@/lib/supabase/server`) — never this one. (rokki/CLAUDE.md non-negotiable.)
 */
import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { marketsDb, type MarketsClient } from "./db";

let cached: SupabaseClient<Database> | null = null;

/** Raw service-role client (knows the generated Rokki schema, e.g. notifications). */
export function marketsAdminBase(): SupabaseClient<Database> {
  if (!cached) {
    cached = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return cached;
}

/** Service-role client re-typed to know the mkt_* tables. */
export function marketsAdmin(): MarketsClient {
  return marketsDb(marketsAdminBase());
}
