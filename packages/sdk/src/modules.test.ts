import { describe, it, expect, beforeEach } from "vitest";
import type { ModuleManifest } from "./modules.js";
import { manifestSupportsScope } from "./modules.js";
import {
  registerModule,
  getModuleManifest,
  listModuleManifests,
  listManifestsForScope,
  routeForScope,
  __resetModuleRegistryForTests,
} from "./module-registry.js";

const TASKS: ModuleManifest = {
  slug: "tasks",
  name: "Tasks",
  description: "tasks",
  icon: "check-square",
  scopes: ["user", "space", "terminal"],
  routes: {
    user: "/modules/tasks",
    space: "/s/[slug]/tasks",
    terminal: "/p/[ticker]/tasks",
  },
};

const FILES: ModuleManifest = {
  slug: "files",
  name: "Files",
  description: "files",
  icon: "folder",
  scopes: ["space", "terminal"],
  routes: { space: "/s/[slug]/files", terminal: "/p/[ticker]/files" },
};

describe("module-registry", () => {
  beforeEach(() => {
    __resetModuleRegistryForTests();
  });

  it("registers and retrieves manifests by slug", () => {
    registerModule(TASKS);
    expect(getModuleManifest("tasks")).toEqual(TASKS);
  });

  it("returns undefined for unknown slugs", () => {
    expect(getModuleManifest("nonexistent")).toBeUndefined();
  });

  it("listing reflects insertion order", () => {
    registerModule(TASKS);
    registerModule(FILES);
    expect(listModuleManifests().map((m) => m.slug)).toEqual([
      "tasks",
      "files",
    ]);
  });

  it("idempotent registration with identical object is a no-op", () => {
    registerModule(TASKS);
    registerModule(TASKS);
    expect(listModuleManifests().length).toBe(1);
  });

  it("throws when a slug is re-registered with a different manifest", () => {
    registerModule(TASKS);
    const conflicting = { ...TASKS, name: "Tasks v2" };
    expect(() => registerModule(conflicting)).toThrow(
      /already registered/i,
    );
  });

  it("filters by scope", () => {
    registerModule(TASKS);
    registerModule(FILES);
    expect(listManifestsForScope("user").map((m) => m.slug)).toEqual([
      "tasks",
    ]);
    expect(listManifestsForScope("space").map((m) => m.slug).sort()).toEqual([
      "files",
      "tasks",
    ]);
    expect(
      listManifestsForScope("terminal").map((m) => m.slug).sort(),
    ).toEqual(["files", "tasks"]);
  });

  it("resolves route for the right scope", () => {
    registerModule(TASKS);
    expect(routeForScope(TASKS, "user")).toBe("/modules/tasks");
    expect(routeForScope(TASKS, "space")).toBe("/s/[slug]/tasks");
    expect(routeForScope(TASKS, "terminal")).toBe("/p/[ticker]/tasks");
  });

  it("returns undefined for a scope a manifest doesn't support", () => {
    registerModule(FILES);
    expect(routeForScope(FILES, "user")).toBeUndefined();
  });
});

describe("manifestSupportsScope", () => {
  it("returns true when scope is in the list", () => {
    expect(manifestSupportsScope(TASKS, "user")).toBe(true);
    expect(manifestSupportsScope(TASKS, "space")).toBe(true);
    expect(manifestSupportsScope(TASKS, "terminal")).toBe(true);
  });

  it("returns false when scope is missing", () => {
    expect(manifestSupportsScope(FILES, "user")).toBe(false);
  });
});
