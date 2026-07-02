import { createHash, timingSafeEqual } from "crypto";

/**
 * Constant-time comparison of two strings. Both are SHA-256'd first so the
 * comparison is over equal-length buffers (timingSafeEqual throws on unequal
 * lengths and would otherwise leak the secret's length).
 */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Authorize a public cron endpoint. Accepts either `x-cron-secret: <CRON_SECRET>`
 * or `Authorization: Bearer <CRON_SECRET>`. The secret is compared in constant
 * time so the early-exit `===` can't be used as a timing oracle to recover it.
 * Returns false when CRON_SECRET is unset (fail closed).
 */
export function verifyCronSecret(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader && safeEqual(cronHeader, expected)) return true;
  const auth = request.headers.get("authorization");
  if (auth && safeEqual(auth, `Bearer ${expected}`)) return true;
  return false;
}
