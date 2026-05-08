import { describe, expect, it } from "vitest";
import { withToolTips, type TickerTip } from "./ticker-tips";

const item = (id: string) => ({ id, text: `e-${id}`, when: "1m" });

describe("withToolTips — the bug that crashed the dashboard at 10+ rows", () => {
  it("does not push undefined into the stream at idx 9, 19, 29", () => {
    // Pre-fix: `tips[(idx / 10) % tips.length]` evaluated to
    // `tips[0.9]`, `tips[1.9]`, `tips[2.9]` — all undefined. The
    // renderer then read `.id` on undefined and threw.
    const items = Array.from({ length: 30 }, (_, i) => item(`a-${i}`));
    const out = withToolTips(items);
    for (const row of out) {
      expect(row).toBeDefined();
      expect((row as { id: string }).id).toBeTruthy();
    }
  });

  it("inserts a tip exactly every 10th slot", () => {
    const items = Array.from({ length: 30 }, (_, i) => item(`x-${i}`));
    const out = withToolTips(items);
    // Tips are pushed AFTER each multiple of 10, so there are 3:
    // after item idx=9, idx=19, idx=29.
    const tips = out.filter((r) => "tip" in r && r.tip);
    expect(tips).toHaveLength(3);
  });

  it("rotates through the tip list", () => {
    const tips: TickerTip[] = [
      { id: "t1", text: "1", when: "", tip: true },
      { id: "t2", text: "2", when: "", tip: true },
      { id: "t3", text: "3", when: "", tip: true },
    ];
    const items = Array.from({ length: 50 }, (_, i) => item(`x-${i}`));
    const out = withToolTips(items, tips);
    const tipIds = out
      .filter((r) => "tip" in r && r.tip)
      .map((r) => (r as TickerTip).id);
    // 50 items → tips after idx 9, 19, 29, 39, 49 → 5 tips
    expect(tipIds).toEqual(["t1", "t2", "t3", "t1", "t2"]);
  });

  it("no-ops for short streams (< 5 items)", () => {
    const items = [item("a"), item("b"), item("c")];
    const out = withToolTips(items);
    expect(out).toEqual(items);
    expect(out.some((r) => "tip" in r && r.tip)).toBe(false);
  });

  it("no-ops when tips array is empty", () => {
    const items = Array.from({ length: 30 }, (_, i) => item(`x-${i}`));
    const out = withToolTips(items, []);
    expect(out).toHaveLength(30);
    expect(out.some((r) => "tip" in r && r.tip)).toBe(false);
  });

  it("custom interval respects `every` arg", () => {
    const items = Array.from({ length: 20 }, (_, i) => item(`x-${i}`));
    const out = withToolTips(items, undefined, 5);
    // Tips after idx 4, 9, 14, 19 → 4 tips.
    const tips = out.filter((r) => "tip" in r && r.tip);
    expect(tips).toHaveLength(4);
  });
});
