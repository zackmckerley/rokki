import { describe, it, expect } from "vitest";
import { reorder } from "./usePinReorder";
import type { InstalledModuleEntry } from "./types";

const M = (slug: string, displayOrder: number): InstalledModuleEntry => ({
  slug,
  name: slug,
  icon: "x",
  scope: "space",
  displayOrder,
  pinned: true,
});

describe("reorder — pure pin-reorder logic", () => {
  it("moves source before target and renumbers display orders", () => {
    const before = [M("a", 0), M("b", 1), M("c", 2), M("d", 3)];
    const after = reorder(before, "d", "b");
    expect(after.map((m) => m.slug)).toEqual(["a", "d", "b", "c"]);
    expect(after.map((m) => m.displayOrder)).toEqual([0, 1, 2, 3]);
  });

  it("no-op when source not found", () => {
    const before = [M("a", 0), M("b", 1)];
    const after = reorder(before, "x", "b");
    expect(after).toBe(before);
  });

  it("no-op when source == target", () => {
    const before = [M("a", 0), M("b", 1)];
    const after = reorder(before, "a", "a");
    // source is removed before findIndex(target) runs → target not found
    expect(after).toBe(before);
  });

  it("renumbers when moving to first position", () => {
    const before = [M("a", 0), M("b", 1), M("c", 2)];
    const after = reorder(before, "c", "a");
    expect(after.map((m) => m.slug)).toEqual(["c", "a", "b"]);
    expect(after.map((m) => m.displayOrder)).toEqual([0, 1, 2]);
  });
});

describe("reorder — property: 200 random scenarios", () => {
  it("invariants hold across 200 randomized inputs", () => {
    function rng(seed: number) {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) % 2 ** 32;
        return s / 2 ** 32;
      };
    }
    const rand = rng(11);
    const slugs = ["a", "b", "c", "d", "e", "f", "g", "h"];

    for (let i = 0; i < 200; i++) {
      const k = 2 + Math.floor(rand() * (slugs.length - 1));
      const items = slugs
        .slice(0, k)
        .map((s, idx) => M(s, idx));
      const source = items[Math.floor(rand() * items.length)]!.slug;
      const target = items[Math.floor(rand() * items.length)]!.slug;
      const result = reorder(items, source, target);

      // Invariant 1: length preserved
      expect(result.length).toBe(items.length);
      // Invariant 2: same set of slugs
      const inSlugs = new Set(items.map((m) => m.slug));
      const outSlugs = new Set(result.map((m) => m.slug));
      expect(outSlugs).toEqual(inSlugs);
      // Invariant 3: display_order is contiguous 0..N-1
      result.forEach((m, idx) => {
        expect(m.displayOrder).toBe(idx);
      });
    }
  });
});
