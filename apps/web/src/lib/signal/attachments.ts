/**
 * Outbound Signal attachment authorization.
 *
 * The bridge downloads each attachment with the Supabase SERVICE ROLE, which
 * bypasses storage RLS — so the per-user key prefix is the ONLY tenant
 * boundary for outbound media. Every attachment a user asks to send must live
 * under their own prefix; otherwise a forged `storage_key` could fetch (and
 * thereby exfiltrate) another user's private file. The send route enforces
 * this, and the bridge re-checks it as defense-in-depth.
 */

/**
 * True iff `storageKey` is a non-empty string owned by `userId` — i.e. exactly
 * `<userId>` or anything under the `<userId>/` prefix. Note the trailing slash:
 * it prevents prefix confusion (`u1` must NOT own `u11/...`).
 */
export function ownsStorageKey(userId: string, storageKey: unknown): boolean {
  return (
    typeof storageKey === "string" &&
    storageKey.length > 0 &&
    (storageKey === userId || storageKey.startsWith(`${userId}/`))
  );
}
