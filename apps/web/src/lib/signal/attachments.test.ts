import { describe, it, expect } from "vitest";
import { ownsStorageKey } from "./attachments";

describe("ownsStorageKey", () => {
  const me = "11111111-1111-1111-1111-111111111111";
  const other = "22222222-2222-2222-2222-222222222222";

  it("accepts keys under the caller's own prefix", () => {
    expect(ownsStorageKey(me, `${me}/outgoing/abc`)).toBe(true);
    expect(ownsStorageKey(me, `${me}/thread-9/att-1`)).toBe(true);
    expect(ownsStorageKey(me, me)).toBe(true); // exact match (no sub-path)
  });

  it("rejects another user's key — the IDOR / cross-tenant exfiltration case", () => {
    expect(ownsStorageKey(me, `${other}/outgoing/abc`)).toBe(false);
    expect(ownsStorageKey(me, `${other}/thread-9/att-1`)).toBe(false);
  });

  it("rejects prefix confusion (trailing-slash boundary)", () => {
    // `me` must NOT own a key whose first segment merely starts with `me`.
    expect(ownsStorageKey("u1", "u11/secret")).toBe(false);
    expect(ownsStorageKey("u1", "u1x")).toBe(false);
  });

  it("rejects path-traversal and malformed values", () => {
    expect(ownsStorageKey(me, "../etc/passwd")).toBe(false);
    expect(ownsStorageKey(me, "")).toBe(false);
    expect(ownsStorageKey(me, undefined)).toBe(false);
    expect(ownsStorageKey(me, null)).toBe(false);
    expect(ownsStorageKey(me, 123)).toBe(false);
    expect(ownsStorageKey(me, { storage_key: `${me}/x` })).toBe(false);
  });
});
