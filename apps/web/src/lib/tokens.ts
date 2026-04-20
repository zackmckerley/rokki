import crypto from "node:crypto";

/**
 * Access token shape: rk_live_<22-char base62><32-char base62>.
 * Total ~320 bits of entropy. See docs/04_AUTH_SECURITY.md §4.2.
 */
const BASE62 =
  "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

function base62Encode(bytes: Uint8Array): string {
  // Use hex-to-base62 via BigInt for simplicity; plenty fast for token generation.
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = "";
  while (n > 0n) {
    out = BASE62[Number(n % 62n)] + out;
    n /= 62n;
  }
  return out.padStart(22, "0");
}

export function generateToken(): {
  plaintext: string;
  prefix: string;
  hash: string;
} {
  const envPrefix =
    process.env.NODE_ENV === "production" ? "rk_live_" : "rk_test_";
  const front = base62Encode(crypto.randomBytes(17)).slice(0, 22);
  const back = base62Encode(crypto.randomBytes(24)).slice(0, 32);
  const plaintext = `${envPrefix}${front}_${back}`;
  const prefix = plaintext.slice(0, envPrefix.length + 6); // env + first 6 of front
  const hash = crypto.createHash("sha256").update(plaintext).digest("hex");
  return { plaintext, prefix, hash };
}

export function hashToken(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}
