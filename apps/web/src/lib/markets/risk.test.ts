import { describe, it, expect } from "vitest";
import { dailyReturns, stdev, maxDrawdown, totalReturn } from "./risk";

describe("dailyReturns", () => {
  it("computes period-over-period returns", () => {
    expect(dailyReturns([1, 2, 3])).toEqual([1, 0.5]);
  });
  it("skips a bar whose prior close is 0", () => {
    expect(dailyReturns([0, 2, 4])).toEqual([1]); // (4-2)/2 only
  });
  it("is empty for a single point", () => {
    expect(dailyReturns([5])).toEqual([]);
  });
});

describe("stdev", () => {
  it("0 for constant or single-element series", () => {
    expect(stdev([3, 3, 3])).toBe(0);
    expect(stdev([3])).toBe(0);
  });
  it("sample std (n-1)", () => {
    expect(stdev([0, 2])).toBeCloseTo(Math.SQRT2, 6); // var=2 → √2
  });
});

describe("maxDrawdown", () => {
  it("finds the largest peak-to-trough drop", () => {
    expect(maxDrawdown([10, 8, 12, 6])).toBeCloseTo(0.5, 6); // 12 → 6
  });
  it("0 for a monotonically rising series", () => {
    expect(maxDrawdown([1, 2, 3, 4])).toBe(0);
  });
});

describe("totalReturn", () => {
  it("first → last", () => {
    expect(totalReturn([100, 110])).toBeCloseTo(0.1, 6);
    expect(totalReturn([100, 80])).toBeCloseTo(-0.2, 6);
  });
  it("0 when too short", () => {
    expect(totalReturn([100])).toBe(0);
  });
});
