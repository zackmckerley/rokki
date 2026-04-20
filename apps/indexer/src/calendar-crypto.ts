import crypto from "node:crypto";

/**
 * Mirror of apps/web/src/lib/token-crypto.ts. The indexer runs in its own
 * process so it needs the same helpers. If the web app rotates its key
 * format, change both sides.
 */

function masterKey(): Buffer | null {
  const b64 = process.env.TOKEN_ENCRYPTION_KEY;
  if (!b64) return null;
  const buf = Buffer.from(b64, "base64");
  if (buf.length !== 32) return null;
  return buf;
}

export function cryptoEnabled(): boolean {
  return masterKey() !== null;
}

export interface Encrypted {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptToken(plaintext: string): Encrypted {
  const key = masterKey();
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY not set on indexer");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptToken(e: Encrypted): string {
  const key = masterKey();
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY not set on indexer");
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(e.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(e.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(e.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
