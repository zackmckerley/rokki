import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@rokki/db";

export interface AuthedSession {
  userId: string;
  userEmail: string;
  tokenId: string;
  scopes: ("read" | "write" | "admin")[];
  projectRestrictions: string[] | null;
}

const admin = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function authenticate(
  header: string | undefined,
): Promise<AuthedSession | null> {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  const hash = crypto.createHash("sha256").update(token).digest("hex");

  const { data, error } = await admin
    .from("access_tokens")
    .select("id, user_id, scopes, project_restrictions, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now())
    return null;

  const { data: userRow } = await admin.auth.admin.getUserById(data.user_id);
  const email = userRow?.user?.email;
  if (!email) return null;

  // Best-effort touch last_used_at (don't await)
  void admin
    .from("access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    userId: data.user_id,
    userEmail: email,
    tokenId: data.id,
    scopes: data.scopes as ("read" | "write" | "admin")[],
    projectRestrictions: data.project_restrictions,
  };
}

export { admin };
