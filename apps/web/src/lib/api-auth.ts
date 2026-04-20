import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";
import { hashToken } from "./tokens";

export interface BearerAuth {
  userId: string;
  tokenId: string;
  scopes: string[];
  admin: ReturnType<typeof createAdminClient<Database>>;
}

/**
 * Validate an `Authorization: Bearer rk_...` header and return the token
 * owner + a service-role supabase client. The caller is responsible for
 * enforcing RLS semantics — the client bypasses RLS by design, so every
 * query should filter by `user_id` or similar explicitly.
 *
 * Returns null if the header is missing, malformed, or the token is
 * unknown/expired/revoked. `last_used_at` is bumped best-effort on each
 * successful validation.
 */
export async function validateBearer(
  request: Request,
): Promise<BearerAuth | null> {
  const auth =
    request.headers.get("authorization") ?? request.headers.get("Authorization");
  if (!auth) return null;
  const match = /^Bearer\s+(rk_(?:live|test)_[A-Za-z0-9_]+)$/.exec(auth);
  if (!match) return null;
  const plaintext = match[1]!;
  const hash = hashToken(plaintext);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const admin = createAdminClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data } = await admin
    .from("access_tokens")
    .select("id, user_id, scopes, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  const row = data as
    | {
        id: string;
        user_id: string;
        scopes: string[];
        expires_at: string | null;
        revoked_at: string | null;
      }
    | null;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;

  // Fire-and-forget last_used bump so audit shows recent use.
  void (
    admin.from("access_tokens") as unknown as {
      update: (p: Record<string, unknown>) => {
        eq: (col: string, val: string) => Promise<unknown>;
      };
    }
  )
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.id);

  return {
    userId: row.user_id,
    tokenId: row.id,
    scopes: row.scopes ?? [],
    admin,
  };
}
