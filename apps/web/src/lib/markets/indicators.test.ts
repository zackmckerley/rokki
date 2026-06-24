import { describe, it, expect } from "vitest";
import { sma, ema } from "./indicators";

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
