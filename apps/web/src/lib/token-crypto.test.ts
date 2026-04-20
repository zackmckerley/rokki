import { beforeAll, describe, it, expect } from "vitest";
import crypto from "node:crypto";

const KEY = crypto.randomBytes(32).toString("base64");

describe("token-crypto", () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = KEY;
  });

  it("round-trips UTF-8 strings", async () => {
    const { encryptToken, decryptToken } = await import("./token-crypto");
    const secret = "ya29.a0AfH6SMA…lots_of_chars…end";
    const e = encryptToken(secret);
    expect(e.ciphertext).not.toBe(secret);
    expect(decryptToken(e)).toBe(secret);
  });

  it("produces a distinct IV per call", async () => {
    const { encryptToken } = await import("./token-crypto");
    const a = encryptToken("x");
    const b = encryptToken("x");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails to decrypt with a tampered ciphertext", async () => {
    const { encryptToken, decryptToken } = await import("./token-crypto");
    const e = encryptToken("secret");
    const bad = { ...e, ciphertext: Buffer.from("x").toString("base64") };
    expect(() => decryptToken(bad)).toThrow();
  });
});
