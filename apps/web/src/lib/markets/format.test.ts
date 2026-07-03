import { describe, it, expect } from "vitest";
import { fmtChange, fmtPct, fmtCompact } from "./format";

describe("fmtChange / fmtPct — no signed zero", () => {
  it("sub-unit values that round to zero have no sign", () => {
    expect(fmtChange(0.001)).toBe("0.00");
    expect(fmtChange(-0.001)).toBe("0.00");
    expect(fmtPct(0.001)).toBe("0.00%");
    expect(fmtPct(-0.001)).toBe("0.00%");
  });
  it("real positives get +, negatives keep their sign", () => {
    expect(fmtChange(1.5)).toBe("+1.50");
    expect(fmtChange(-2.3)).toBe("-2.30");
    expect(fmtPct(3)).toBe("+3.00%");
  });
  it("null/NaN → em dash", () => {
    expect(fmtChange(null)).toBe("—");
    expect(fmtPct(undefined)).toBe("—");
  });
});

describe("fmtCompact — tier boundary rounding", () => {
  it("values that round up into the next tier promote", () => {
    expect(fmtCompact(999_999.5)).toBe("1.00M");
    expect(fmtCompact(999_999_999)).toBe("1.00B");
  });
  it("normal values stay in their tier", () => {
    expect(fmtCompact(1_500)).toBe("1.5K");
    expect(fmtCompact(3_400_000)).toBe("3.40M");
    expect(fmtCompact(999_499)).toBe("999.5K");
  });
});
