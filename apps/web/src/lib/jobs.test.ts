import { describe, it, expect } from "vitest";
import { lockKeyFor, nextBackoffMs } from "./jobs";

describe("nextBackoffMs", () => {
  it("follows the documented [1m, 5m, 25m, 2h, 12h] schedule", () => {
    expect(nextBackoffMs(1)).toBe(1 * 60_000);
    expect(nextBackoffMs(2)).toBe(5 * 60_000);
    expect(nextBackoffMs(3)).toBe(25 * 60_000);
    expect(nextBackoffMs(4)).toBe(120 * 60_000);
    expect(nextBackoffMs(5)).toBe(720 * 60_000);
  });

  it("clamps overflow past the table to the longest wait", () => {
    expect(nextBackoffMs(99)).toBe(720 * 60_000);
  });

  it("clamps zero/negative to the first slot", () => {
    expect(nextBackoffMs(0)).toBe(1 * 60_000);
    expect(nextBackoffMs(-3)).toBe(1 * 60_000);
  });
});

describe("lockKeyFor", () => {
  it("is deterministic for the same queue name", () => {
    expect(lockKeyFor("webhook_delivery")).toBe(lockKeyFor("webhook_delivery"));
  });

  it("returns different keys for different names (sanity, not collision-free)", () => {
    expect(lockKeyFor("webhook_delivery")).not.toBe(lockKeyFor("rag_indexer"));
    expect(lockKeyFor("a")).not.toBe(lockKeyFor("b"));
  });

  it("fits in a signed 32-bit int range", () => {
    const v = lockKeyFor("any_long_queue_name_here_should_be_fine");
    expect(v).toBeGreaterThanOrEqual(-(2 ** 31));
    expect(v).toBeLessThan(2 ** 31);
    expect(Number.isInteger(v)).toBe(true);
  });
});
