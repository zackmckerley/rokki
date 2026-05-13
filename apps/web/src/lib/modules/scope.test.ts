import { describe, it, expect } from "vitest";
import { applyPins } from "./scope";
import type { InstalledModuleEntry } from "@/components/pane/types";

const MOD = (
  slug: string,
  displayOrder: number,
  pinned = true,
): InstalledModuleEntry => ({
  slug,
  name: slug,
  icon: "x",
  scope: "space",
  displayOrder,
  pinned,
});

describe("applyPins", () => {
  it("returns the installed list unchanged when there are no pins", () => {
    const installed = [MOD("tasks", 0), MOD("files", 1), MOD("goals", 2)];
    const result = applyPins(installed, []);
    expect(result.map((m) => m.slug)).toEqual(["tasks", "files", "goals"]);
  });

  it("reorders installed modules according to pins", () => {
    const installed = [MOD("tasks", 0), MOD("files", 1), MOD("goals", 2)];
    const pins = [
      { slug: "goals", displayOrder: 0, fnKey: null },
      { slug: "tasks", displayOrder: 1, fnKey: null },
      { slug: "files", displayOrder: 2, fnKey: null },
    ];
    const result = applyPins(installed, pins);
    expect(result.map((m) => m.slug)).toEqual(["goals", "tasks", "files"]);
  });

  it("filters out modules with a pin of displayOrder=-1 (sentinel for hidden)", () => {
    const installed = [MOD("tasks", 0), MOD("files", 1), MOD("goals", 2)];
    const pins = [{ slug: "files", displayOrder: -1, fnKey: null }];
    const result = applyPins(installed, pins);
    expect(result.map((m) => m.slug)).toEqual(["tasks", "goals"]);
  });

  it("keeps non-pinned modules at their original order after pinned ones", () => {
    const installed = [
      MOD("a", 0),
      MOD("b", 1),
      MOD("c", 2),
      MOD("d", 3),
    ];
    const pins = [{ slug: "c", displayOrder: 0, fnKey: null }];
    const result = applyPins(installed, pins);
    // "c" jumps to the front (displayOrder=0); the others keep their slots
    expect(result.map((m) => m.slug)[0]).toBe("c");
  });
});

describe("applyPins — property: stable for 200 random orderings", () => {
  // Run 200 randomized scenarios verifying invariants:
  //   1. Total count is bounded by installed.length (no duplicates)
  //   2. Every returned entry's slug exists in installed
  //   3. Hidden pins (displayOrder=-1) always filter out
  it("invariants hold across 200 randomized inputs", () => {
    const slugs = ["a", "b", "c", "d", "e", "f", "g", "h"];

    function rng(seed: number): () => number {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) % 2 ** 32;
        return s / 2 ** 32;
      };
    }

    for (let i = 0; i < 200; i++) {
      const rand = rng(i + 1);
      // Random subset of installed modules
      const installed: InstalledModuleEntry[] = slugs
        .filter(() => rand() > 0.3)
        .map((s, idx) => MOD(s, idx));
      // Random pins, possibly with sentinels
      const pins = slugs
        .filter(() => rand() > 0.5)
        .map((s) => ({
          slug: s,
          displayOrder: rand() < 0.2 ? -1 : Math.floor(rand() * 5),
          fnKey: null,
        }));
      const hidden = new Set(
        pins.filter((p) => p.displayOrder === -1).map((p) => p.slug),
      );
      const result = applyPins(installed, pins);

      // Invariant 1: no duplicates
      const seen = new Set<string>();
      for (const r of result) {
        expect(seen.has(r.slug)).toBe(false);
        seen.add(r.slug);
      }
      // Invariant 2: every result slug was in installed
      const installedSlugs = new Set(installed.map((m) => m.slug));
      for (const r of result) {
        expect(installedSlugs.has(r.slug)).toBe(true);
      }
      // Invariant 3: no hidden slug appears
      for (const h of hidden) {
        expect(result.find((r) => r.slug === h)).toBeUndefined();
      }
    }
  });
});
