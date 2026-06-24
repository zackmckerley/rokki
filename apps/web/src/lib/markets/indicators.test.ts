import { describe, it, expect } from "vitest";
import { sma, ema, rsi } from "./indicators";

describe("sma", () => {
  it("nulls until the window fills, then averages", () => {
    expect(sma([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
  });
  it("returns all-null when shorter than the period", () => {
    expect(sma([1, 2], 3)).toEqual([null, null]);
  });
});

describe("ema", () => {
  it("seeds with the SMA of the first window, then smooths", () => {
    // period 3 → k = 0.5; seed = mean(1,2,3) = 2
    const out = ema([1, 2, 3, 4, 5], 3);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(2, 6);
    expect(out[3]).toBeCloseTo(3, 6); // 4*0.5 + 2*0.5
    expect(out[4]).toBeCloseTo(4, 6); // 5*0.5 + 3*0.5
  });
  it("returns all-null when shorter than the period", () => {
    expect(ema([1, 2], 5)).toEqual([null, null, null, null, null].slice(0, 2));
  });
});

describe("rsi", () => {
  it("is null until `period` deltas exist, then bounded 0–100", () => {
    // Wilder's textbook series (period 14).
    const closes = [
      44, 44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08,
      45.89, 46.03, 45.61, 46.28, 46.28,
    ];
    const out = rsi(closes, 14);
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true);
    expect(out[14]).not.toBeNull();
    for (const v of out) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });

  it("is 100 for a rising series and 0 for a falling one", () => {
    const rising = Array.from({ length: 20 }, (_, i) => i + 1);
    const falling = Array.from({ length: 20 }, (_, i) => 20 - i);
    expect(rsi(rising, 14)[19]).toBe(100);
    expect(rsi(falling, 14)[19]).toBe(0);
  });

  it("is all-null when shorter than the period", () => {
    expect(rsi([1, 2, 3], 14).every((v) => v === null)).toBe(true);
  });
});
