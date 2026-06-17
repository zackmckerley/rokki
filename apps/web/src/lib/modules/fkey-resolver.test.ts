import { describe, it, expect, beforeEach } from "vitest";
import { resolveFKey, urlForSlug } from "./fkey-resolver";
import {
  registerModule,
  __resetModuleRegistryForTests,
} from "@rokki/sdk";

beforeEach(() => {
  __resetModuleRegistryForTests();
  registerModule({
    slug: "tasks",
    name: "Tasks",
    description: "t",
    icon: "check-square",
    scopes: ["user", "space", "terminal"],
    routes: {
      user: "/modules/tasks",
      space: "/s/[slug]/tasks",
      terminal: "/p/[ticker]/tasks",
    },
  });
  registerModule({
    slug: "goals",
    name: "Goals",
    description: "g",
    icon: "target",
    scopes: ["space", "terminal"],
    routes: { space: "/s/[slug]/goals", terminal: "/p/[ticker]/goals" },
  });
  registerModule({
    slug: "files",
    name: "Files",
    description: "f",
    icon: "folder",
    scopes: ["space", "terminal"],
    routes: { space: "/s/[slug]/files", terminal: "/p/[ticker]/files" },
  });
});

describe("urlForSlug", () => {
  it("substitutes [slug] for space scope", () => {
    expect(urlForSlug("tasks", { kind: "space", key: "helios" })).toBe(
      "/s/helios/tasks",
    );
    expect(urlForSlug("goals", { kind: "space", key: "personal" })).toBe(
      "/s/personal/goals",
    );
  });

  it("substitutes [ticker] for terminal scope", () => {
    expect(urlForSlug("tasks", { kind: "terminal", key: "CASA" })).toBe(
      "/p/CASA/tasks",
    );
  });

  it("returns user-scope route as-is", () => {
    expect(urlForSlug("tasks", { kind: "user" })).toBe("/modules/tasks");
  });

  it("returns null when manifest doesn't support the scope", () => {
    expect(urlForSlug("goals", { kind: "user" })).toBeNull();
    expect(urlForSlug("files", { kind: "user" })).toBeNull();
  });

  it("returns null for unknown slugs", () => {
    expect(urlForSlug("nonexistent", { kind: "user" })).toBeNull();
  });

  it("returns null when space/terminal scope has no key", () => {
    expect(urlForSlug("tasks", { kind: "space" })).toBeNull();
    expect(urlForSlug("tasks", { kind: "terminal" })).toBeNull();
  });
});

describe("resolveFKey — fixed bindings", () => {
  it("F1 → /help (always)", () => {
    expect(resolveFKey("F1", { kind: "user" }, [])).toBe("/help");
  });
  it("F2 → /modules/tasks", () => {
    expect(resolveFKey("F2", { kind: "user" }, [])).toBe("/modules/tasks");
  });
  it("F3 → /modules/messenger", () => {
    expect(resolveFKey("F3", { kind: "user" }, [])).toBe("/modules/messenger");
  });
  it("F4 → null (Tools out of scope per locked decision #5)", () => {
    expect(resolveFKey("F4", { kind: "user" }, [])).toBeNull();
  });
});

describe("resolveFKey — user pins", () => {
  it("F5 resolves to a pinned module's URL at current scope", () => {
    const pins = [{ slug: "goals", fnKey: 5 }];
    expect(resolveFKey("F5", { kind: "space", key: "helios" }, pins)).toBe(
      "/s/helios/goals",
    );
  });

  it("F5 returns null when nothing is pinned to it", () => {
    expect(resolveFKey("F5", { kind: "space", key: "helios" }, [])).toBeNull();
  });

  it("F11+ returns null (out of range)", () => {
    expect(
      resolveFKey("F11", { kind: "space", key: "helios" }, [
        { slug: "goals", fnKey: 5 },
      ]),
    ).toBeNull();
  });

  it("non-F keys return null", () => {
    expect(
      resolveFKey("a", { kind: "space", key: "helios" }, [
        { slug: "goals", fnKey: 5 },
      ]),
    ).toBeNull();
  });

  it("user-scope F5 with a space-only module returns null (manifest gate)", () => {
    // goals doesn't have a user route — pin to F5 is pointless at user scope
    const pins = [{ slug: "goals", fnKey: 5 }];
    expect(resolveFKey("F5", { kind: "user" }, pins)).toBeNull();
  });
});

describe("resolveFKey — property: 200 random scenarios", () => {
  it("invariants hold across 200 random inputs", () => {
    const slugs = ["tasks", "goals", "files"];
    const scopes: Array<Parameters<typeof resolveFKey>[1]> = [
      { kind: "user" },
      { kind: "space", key: "helios" },
      { kind: "space", key: "personal" },
      { kind: "terminal", key: "CASA" },
      { kind: "terminal", key: "HM" },
    ];

    function rng(seed: number) {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) % 2 ** 32;
        return s / 2 ** 32;
      };
    }
    const rand = rng(7);

    for (let i = 0; i < 200; i++) {
      const fkeyN = 1 + Math.floor(rand() * 12); // F1..F12
      const scope = scopes[Math.floor(rand() * scopes.length)]!;
      // Random pin set, possibly with conflicting fkeys (handler should
      // pick the first match in array order).
      const pins: { slug: string; fnKey: number }[] = [];
      for (const s of slugs) {
        if (rand() > 0.5) {
          pins.push({ slug: s, fnKey: 5 + Math.floor(rand() * 6) });
        }
      }
      const result = resolveFKey(`F${fkeyN}`, scope, pins);

      // Invariant: result is either null or a non-empty string
      if (result !== null) {
        expect(typeof result).toBe("string");
        expect((result as string).length).toBeGreaterThan(0);
      }
      // Invariant: F1..F3 always non-null; F4 always null
      if (fkeyN === 1 || fkeyN === 2 || fkeyN === 3) {
        expect(result).not.toBeNull();
      }
      if (fkeyN === 4) {
        expect(result).toBeNull();
      }
      // Invariant: F11+ always null
      if (fkeyN > 10) {
        expect(result).toBeNull();
      }
    }
  });
});
