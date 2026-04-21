import { encryptToken, decryptToken, cryptoEnabled } from "./token-crypto";

/**
 * The "account ring" — a list of authenticated identities the user has
 * stacked in this browser. Stored as an HttpOnly cookie so it survives
 * page loads but is invisible to JS XSS.
 *
 * Each entry holds the user_id, email, and an *encrypted* Supabase
 * refresh token. The active account is signalled by the standard
 * `sb-*-auth-token` cookie that Supabase already sets — the ring is
 * just the bench of others you can switch back to.
 *
 * Cookie shape (after JSON.parse):
 *   [
 *     { user_id, email, rt_ciphertext, rt_iv, rt_tag, added_at },
 *     ...
 *   ]
 *
 * Refresh tokens are encrypted with TOKEN_ENCRYPTION_KEY (AES-256-GCM)
 * so a stolen ring cookie alone can't be replayed against Supabase
 * unless the attacker also has the server's master key.
 */

export const RING_COOKIE = "rokki_account_ring";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 days

export interface RingEntryPublic {
  user_id: string;
  email: string;
  added_at: string;
}

interface RingEntry extends RingEntryPublic {
  rt_ciphertext: string;
  rt_iv: string;
  rt_tag: string;
}

/**
 * Parse the ring cookie value. Returns [] for missing/malformed.
 */
export function parseRing(raw: string | undefined | null): RingEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter(
      (e): e is RingEntry =>
        e &&
        typeof e.user_id === "string" &&
        typeof e.email === "string" &&
        typeof e.rt_ciphertext === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Public-shape view of the ring, suitable to expose to the client.
 * Strips the encrypted refresh tokens.
 */
export function publicRing(ring: RingEntry[]): RingEntryPublic[] {
  return ring.map((e) => ({
    user_id: e.user_id,
    email: e.email,
    added_at: e.added_at,
  }));
}

/**
 * Add (or update) an account in the ring.
 */
export function addToRing(
  ring: RingEntry[],
  account: { user_id: string; email: string; refresh_token: string },
): RingEntry[] {
  if (!cryptoEnabled()) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is required for the account ring (cannot store refresh tokens in plaintext).",
    );
  }
  const enc = encryptToken(account.refresh_token);
  const entry: RingEntry = {
    user_id: account.user_id,
    email: account.email,
    rt_ciphertext: enc.ciphertext,
    rt_iv: enc.iv,
    rt_tag: enc.tag,
    added_at: new Date().toISOString(),
  };
  // Replace any existing entry for this user_id so we always have the
  // freshest refresh token (Supabase rotates them).
  return [entry, ...ring.filter((e) => e.user_id !== account.user_id)];
}

/**
 * Remove an account from the ring. Returns the new ring + the removed
 * entry (or null if not present).
 */
export function removeFromRing(
  ring: RingEntry[],
  userId: string,
): { ring: RingEntry[]; removed: RingEntry | null } {
  const removed = ring.find((e) => e.user_id === userId) ?? null;
  return {
    ring: ring.filter((e) => e.user_id !== userId),
    removed,
  };
}

/**
 * Pull a usable refresh token for the given user_id (decrypted), or
 * null if not in the ring.
 */
export function refreshTokenFor(
  ring: RingEntry[],
  userId: string,
): string | null {
  const entry = ring.find((e) => e.user_id === userId);
  if (!entry) return null;
  if (!cryptoEnabled()) return null;
  try {
    return decryptToken({
      ciphertext: entry.rt_ciphertext,
      iv: entry.rt_iv,
      tag: entry.rt_tag,
    });
  } catch {
    return null;
  }
}

/**
 * Cookie options for setting the ring. Centralised so every endpoint
 * agrees on max-age + flags.
 */
export const ringCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: COOKIE_MAX_AGE,
};

/**
 * Serialise a ring back to JSON for cookie storage.
 */
export function serializeRing(ring: RingEntry[]): string {
  return JSON.stringify(ring);
}
