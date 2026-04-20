import crypto from "node:crypto";

/**
 * AES-256-GCM encryption for calendar OAuth tokens and similar secrets
 * that Rokki holds on behalf of the user.
 *
 * The master key comes from TOKEN_ENCRYPTION_KEY (32 bytes, base64). In
 * production this should rotate to a proper envelope scheme with a KMS,
 * but the storage schema already splits ciphertext + iv + tag so that
 * migration is cheap.
 *
 * We refuse to encrypt when the master key is missing rather than falling
 * back to plaintext — a missing key is a configuration bug, not a
 * degradation mode.
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
  ciphertext: string; // base64
  iv: string; // base64
  tag: string; // base64
}

export function encryptToken(plaintext: string): Encrypted {
  const key = masterKey();
  if (!key)
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set — generate 32 random bytes, base64-encode, and add to the web .env.local",
    );
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
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not set");
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
