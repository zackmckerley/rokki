import { describe, it, expect } from "vitest";
import {
  MODULE_CATALOG,
  MODULE_IDS,
  MODULE_LABELS,
  LAYOUT_PRESETS,
  DEFAULT_LAYOUT,
  defaultModulePrefs,
  normalizeModulePrefs,
  parseModulePrefs,
  migrateLegacyMinimized,
  activeModuleIds,
  orderedVisibleModules,
  hiddenModules,
  isHidden,
  isMinimized,
  isOpenByDefault,
  initialMinimized,
  hideModule,
  showModule,
  setModuleHidden,
  toggleModuleHidden,
  moveModule,
  moveModuleBy,
  setModuleMinimized,
  toggleModuleMinimized,
  setModuleOpenByDefault,
  setLayoutPreset,
  setSectionCollapsed,
  setSync,
  resetModulePrefs,
  presetToDashLayout,
  dashLayoutForPrefs,
  serializeModulePrefs,
  modulePrefsEqual,
  type ModulePrefs,
} from "./module-prefs";

const ID = { week: "week", tasks: "tasks", messages: "messages" } as const;

function prefs(over: Partial<ModulePrefs> = {}): ModulePrefs {
  return { ...defaultModulePrefs(), ...over };
}

/* ================================================================== */
/* Catalog constants                                                   */
/* ================================================================== */
describe("module catalog constants", () => {
  it("catalog has the three dashboard modules", () => {
    expect(MODULE_CATALOG.map((m) => m.id)).toEqual(["week", "tasks", "messages"]);
  });
  it("MODULE_IDS mirrors the catalog ids", () => {
    expect(MODULE_IDS).toEqual(["week", "tasks", "messages"]);
  });
  it("week is labelled Schedule", () => {
    expect(MODULE_LABELS.week).toBe("Schedule");
  });
  it("tasks is labelled Tasks", () => {
    expect(MODULE_LABELS.tasks).toBe("Tasks");
  });
  it("messages is labelled Messages", () => {
    expect(MODULE_LABELS.messages).toBe("Messages");
  });
  it("layout presets are stacked + split", () => {
    expect(LAYOUT_PRESETS).toEqual(["stacked", "split"]);
  });
  it("default layout is split", () => {
    expect(DEFAULT_LAYOUT).toBe("split");
  });
});

/* ================================================================== */
/* defaultModulePrefs                                                  */
/* ================================================================== */
describe("defaultModulePrefs", () => {
  it("order is the full catalog", () => {
    expect(defaultModulePrefs().order).toEqual(["week", "tasks", "messages"]);
  });
  it("nothing hidden by default", () => {
    expect(defaultModulePrefs().hidden).toEqual([]);
  });
  it("nothing minimized by default", () => {
    expect(defaultModulePrefs().minimized).toEqual([]);
  });
  it("layout defaults to split", () => {
    expect(defaultModulePrefs().layout).toBe("split");
  });
  it("section not collapsed by default", () => {
    expect(defaultModulePrefs().sectionCollapsed).toBe(false);
  });
  it("sync off by default", () => {
    expect(defaultModulePrefs().sync).toBe(false);
  });
  it("returns a fresh instance each call", () => {
    expect(defaultModulePrefs()).not.toBe(defaultModulePrefs());
  });
  it("order array is not shared between instances", () => {
    const a = defaultModulePrefs();
    a.order.push("x");
    expect(defaultModulePrefs().order).toEqual(["week", "tasks", "messages"]);
  });
});

/* ================================================================== */
/* normalizeModulePrefs                                                */
/* ================================================================== */
describe("normalizeModulePrefs", () => {
  it("null → defaults", () => {
    expect(normalizeModulePrefs(null)).toEqual(defaultModulePrefs());
  });
  it("undefined → defaults", () => {
    expect(normalizeModulePrefs(undefined)).toEqual(defaultModulePrefs());
  });
  it("empty object → defaults", () => {
    expect(normalizeModulePrefs({})).toEqual(defaultModulePrefs());
  });
  it("keeps a valid full order", () => {
    expect(normalizeModulePrefs({ order: ["messages", "week", "tasks"] }).order).toEqual([
      "messages",
      "week",
      "tasks",
    ]);
  });
  it("appends missing ids in catalog order", () => {
    expect(normalizeModulePrefs({ order: ["tasks"] }).order).toEqual([
      "tasks",
      "week",
      "messages",
    ]);
  });
  it("drops unknown ids from order", () => {
    expect(normalizeModulePrefs({ order: ["tasks", "bogus", "week"] }).order).toEqual([
      "tasks",
      "week",
      "messages",
    ]);
  });
  it("dedupes order", () => {
    expect(normalizeModulePrefs({ order: ["tasks", "tasks", "week"] }).order).toEqual([
      "tasks",
      "week",
      "messages",
    ]);
  });
  it("non-array order → default order", () => {
    expect(normalizeModulePrefs({ order: "tasks" as never }).order).toEqual([
      "week",
      "tasks",
      "messages",
    ]);
  });
  it("non-string order entries are dropped", () => {
    expect(normalizeModulePrefs({ order: [1, "tasks", null] as never }).order).toEqual([
      "tasks",
      "week",
      "messages",
    ]);
  });
  it("keeps known hidden ids", () => {
    expect(normalizeModulePrefs({ hidden: ["messages"] }).hidden).toEqual(["messages"]);
  });
  it("drops unknown hidden ids", () => {
    expect(normalizeModulePrefs({ hidden: ["bogus", "tasks"] }).hidden).toEqual(["tasks"]);
  });
  it("dedupes hidden", () => {
    expect(normalizeModulePrefs({ hidden: ["tasks", "tasks"] }).hidden).toEqual(["tasks"]);
  });
  it("non-array hidden → empty", () => {
    expect(normalizeModulePrefs({ hidden: 7 as never }).hidden).toEqual([]);
  });
  it("keeps known minimized ids", () => {
    expect(normalizeModulePrefs({ minimized: ["week"] }).minimized).toEqual(["week"]);
  });
  it("strips minimized ids that are also hidden", () => {
    const p = normalizeModulePrefs({ hidden: ["tasks"], minimized: ["tasks", "week"] });
    expect(p.minimized).toEqual(["week"]);
  });
  it("drops unknown minimized ids", () => {
    expect(normalizeModulePrefs({ minimized: ["nope", "week"] }).minimized).toEqual(["week"]);
  });
  it("accepts stacked layout", () => {
    expect(normalizeModulePrefs({ layout: "stacked" }).layout).toBe("stacked");
  });
  it("accepts split layout", () => {
    expect(normalizeModulePrefs({ layout: "split" }).layout).toBe("split");
  });
  it("invalid layout → default split", () => {
    expect(normalizeModulePrefs({ layout: "grid" as never }).layout).toBe("split");
  });
  it("coerces sectionCollapsed truthy-but-not-true to false", () => {
    expect(normalizeModulePrefs({ sectionCollapsed: 1 as never }).sectionCollapsed).toBe(false);
  });
  it("keeps sectionCollapsed true", () => {
    expect(normalizeModulePrefs({ sectionCollapsed: true }).sectionCollapsed).toBe(true);
  });
  it("coerces sync non-true to false", () => {
    expect(normalizeModulePrefs({ sync: "yes" as never }).sync).toBe(false);
  });
  it("keeps sync true", () => {
    expect(normalizeModulePrefs({ sync: true }).sync).toBe(true);
  });
  it("is idempotent", () => {
    const once = normalizeModulePrefs({ order: ["tasks"], hidden: ["week"] });
    expect(normalizeModulePrefs(once)).toEqual(once);
  });
  it("custom id set restricts known ids", () => {
    expect(normalizeModulePrefs({ order: ["a", "b"] }, ["a", "b"]).order).toEqual(["a", "b"]);
  });
  it("custom id set drops ids outside it", () => {
    expect(normalizeModulePrefs({ order: ["a", "tasks"] }, ["a"]).order).toEqual(["a"]);
  });
});

/* ================================================================== */
/* parseModulePrefs / migrateLegacyMinimized                           */
/* ================================================================== */
describe("parseModulePrefs", () => {
  it("parses a valid object", () => {
    expect(parseModulePrefs({ layout: "stacked" }).layout).toBe("stacked");
  });
  it("array input → defaults", () => {
    expect(parseModulePrefs(["week"])).toEqual(defaultModulePrefs());
  });
  it("null → defaults", () => {
    expect(parseModulePrefs(null)).toEqual(defaultModulePrefs());
  });
  it("string → defaults", () => {
    expect(parseModulePrefs("hi")).toEqual(defaultModulePrefs());
  });
  it("number → defaults", () => {
    expect(parseModulePrefs(42)).toEqual(defaultModulePrefs());
  });
  it("normalizes while parsing", () => {
    expect(parseModulePrefs({ order: ["tasks"] }).order).toEqual(["tasks", "week", "messages"]);
  });
});

describe("migrateLegacyMinimized", () => {
  it("array of ids → minimized patch", () => {
    expect(migrateLegacyMinimized(["tasks", "week"])).toEqual({ minimized: ["tasks", "week"] });
  });
  it("filters non-strings", () => {
    expect(migrateLegacyMinimized(["tasks", 3, null])).toEqual({ minimized: ["tasks"] });
  });
  it("empty array → empty minimized", () => {
    expect(migrateLegacyMinimized([])).toEqual({ minimized: [] });
  });
  it("non-array → empty patch", () => {
    expect(migrateLegacyMinimized(null)).toEqual({});
  });
  it("object → empty patch", () => {
    expect(migrateLegacyMinimized({ minimized: ["x"] })).toEqual({});
  });
  it("migrated patch normalizes into valid prefs", () => {
    const patch = migrateLegacyMinimized(["tasks", "ghost"]);
    expect(normalizeModulePrefs(patch).minimized).toEqual(["tasks"]);
  });
});

/* ================================================================== */
/* activeModuleIds / orderedVisibleModules / hiddenModules             */
/* ================================================================== */
describe("activeModuleIds", () => {
  it("all three by default", () => {
    expect(activeModuleIds(defaultModulePrefs())).toEqual(["week", "tasks", "messages"]);
  });
  it("respects order", () => {
    expect(activeModuleIds(prefs({ order: ["messages", "tasks", "week"] }))).toEqual([
      "messages",
      "tasks",
      "week",
    ]);
  });
  it("excludes hidden", () => {
    expect(activeModuleIds(prefs({ hidden: ["tasks"] }))).toEqual(["week", "messages"]);
  });
  it("excludes multiple hidden", () => {
    expect(activeModuleIds(prefs({ hidden: ["week", "messages"] }))).toEqual(["tasks"]);
  });
  it("all hidden → empty", () => {
    expect(activeModuleIds(prefs({ hidden: ["week", "tasks", "messages"] }))).toEqual([]);
  });
  it("hidden + reordered", () => {
    expect(
      activeModuleIds(prefs({ order: ["messages", "tasks", "week"], hidden: ["tasks"] })),
    ).toEqual(["messages", "week"]);
  });
  it("ignores unknown ids in order", () => {
    expect(activeModuleIds(prefs({ order: ["tasks", "x", "week", "messages"] }))).toEqual([
      "tasks",
      "week",
      "messages",
    ]);
  });
});

describe("orderedVisibleModules", () => {
  it("returns catalog items in order", () => {
    expect(orderedVisibleModules(defaultModulePrefs()).map((m) => m.id)).toEqual([
      "week",
      "tasks",
      "messages",
    ]);
  });
  it("carries labels", () => {
    expect(orderedVisibleModules(defaultModulePrefs())[0].label).toBe("Schedule");
  });
  it("drops hidden modules", () => {
    expect(orderedVisibleModules(prefs({ hidden: ["week"] })).map((m) => m.id)).toEqual([
      "tasks",
      "messages",
    ]);
  });
  it("reorders", () => {
    expect(
      orderedVisibleModules(prefs({ order: ["tasks", "messages", "week"] })).map((m) => m.id),
    ).toEqual(["tasks", "messages", "week"]);
  });
  it("empty when all hidden", () => {
    expect(orderedVisibleModules(prefs({ hidden: ["week", "tasks", "messages"] }))).toEqual([]);
  });
});

describe("hiddenModules", () => {
  it("empty by default", () => {
    expect(hiddenModules(defaultModulePrefs())).toEqual([]);
  });
  it("lists hidden items", () => {
    expect(hiddenModules(prefs({ hidden: ["tasks"] })).map((m) => m.id)).toEqual(["tasks"]);
  });
  it("uses catalog order, not pref order", () => {
    expect(
      hiddenModules(prefs({ order: ["messages", "tasks", "week"], hidden: ["messages", "week"] })).map(
        (m) => m.id,
      ),
    ).toEqual(["week", "messages"]);
  });
  it("all when everything hidden", () => {
    expect(hiddenModules(prefs({ hidden: ["week", "tasks", "messages"] })).length).toBe(3);
  });
});

/* ================================================================== */
/* predicates                                                          */
/* ================================================================== */
describe("isHidden / isMinimized / isOpenByDefault", () => {
  it("isHidden false by default", () => {
    expect(isHidden(defaultModulePrefs(), "tasks")).toBe(false);
  });
  it("isHidden true when hidden", () => {
    expect(isHidden(prefs({ hidden: ["tasks"] }), "tasks")).toBe(true);
  });
  it("isMinimized false by default", () => {
    expect(isMinimized(defaultModulePrefs(), "tasks")).toBe(false);
  });
  it("isMinimized true when minimized", () => {
    expect(isMinimized(prefs({ minimized: ["tasks"] }), "tasks")).toBe(true);
  });
  it("isOpenByDefault true by default", () => {
    expect(isOpenByDefault(defaultModulePrefs(), "tasks")).toBe(true);
  });
  it("isOpenByDefault false when minimized", () => {
    expect(isOpenByDefault(prefs({ minimized: ["tasks"] }), "tasks")).toBe(false);
  });
  it("isOpenByDefault false when hidden", () => {
    expect(isOpenByDefault(prefs({ hidden: ["tasks"] }), "tasks")).toBe(false);
  });
  it("isOpenByDefault false when hidden and minimized", () => {
    expect(isOpenByDefault(prefs({ hidden: ["tasks"], minimized: ["tasks"] }), "tasks")).toBe(false);
  });
});

describe("initialMinimized", () => {
  it("empty by default", () => {
    expect(initialMinimized(defaultModulePrefs())).toEqual([]);
  });
  it("returns minimized active ids", () => {
    expect(initialMinimized(prefs({ minimized: ["week", "tasks"] }))).toEqual(["week", "tasks"]);
  });
  it("excludes minimized ids that are hidden", () => {
    // normalize first to mimic real state; even unnormalized, hidden wins.
    expect(initialMinimized(prefs({ hidden: ["week"], minimized: ["week", "tasks"] }))).toEqual([
      "tasks",
    ]);
  });
  it("excludes unknown ids", () => {
    expect(initialMinimized(prefs({ minimized: ["ghost", "tasks"] }))).toEqual(["tasks"]);
  });
});

/* ================================================================== */
/* hide / show                                                         */
/* ================================================================== */
describe("hideModule / showModule / setModuleHidden / toggleModuleHidden", () => {
  it("hideModule adds to hidden", () => {
    expect(hideModule(defaultModulePrefs(), "tasks").hidden).toEqual(["tasks"]);
  });
  it("hideModule is a no-op when already hidden", () => {
    const p = prefs({ hidden: ["tasks"] });
    expect(hideModule(p, "tasks")).toBe(p);
  });
  it("hideModule clears the module's minimized flag", () => {
    const p = prefs({ minimized: ["tasks", "week"] });
    expect(hideModule(p, "tasks").minimized).toEqual(["week"]);
  });
  it("hideModule ignores unknown ids", () => {
    const p = defaultModulePrefs();
    expect(hideModule(p, "ghost")).toBe(p);
  });
  it("hideModule does not mutate input", () => {
    const p = defaultModulePrefs();
    hideModule(p, "tasks");
    expect(p.hidden).toEqual([]);
  });
  it("hideModule preserves order", () => {
    expect(hideModule(prefs({ order: ["messages", "week", "tasks"] }), "week").order).toEqual([
      "messages",
      "week",
      "tasks",
    ]);
  });
  it("showModule removes from hidden", () => {
    expect(showModule(prefs({ hidden: ["tasks"] }), "tasks").hidden).toEqual([]);
  });
  it("showModule no-op when not hidden", () => {
    const p = defaultModulePrefs();
    expect(showModule(p, "tasks")).toBe(p);
  });
  it("showModule leaves other hidden intact", () => {
    expect(showModule(prefs({ hidden: ["tasks", "week"] }), "tasks").hidden).toEqual(["week"]);
  });
  it("setModuleHidden(true) hides", () => {
    expect(isHidden(setModuleHidden(defaultModulePrefs(), "week", true), "week")).toBe(true);
  });
  it("setModuleHidden(false) shows", () => {
    expect(isHidden(setModuleHidden(prefs({ hidden: ["week"] }), "week", false), "week")).toBe(false);
  });
  it("toggleModuleHidden flips false→true", () => {
    expect(isHidden(toggleModuleHidden(defaultModulePrefs(), "week"), "week")).toBe(true);
  });
  it("toggleModuleHidden flips true→false", () => {
    expect(isHidden(toggleModuleHidden(prefs({ hidden: ["week"] }), "week"), "week")).toBe(false);
  });
  it("toggle twice returns to start", () => {
    const once = toggleModuleHidden(defaultModulePrefs(), "tasks");
    expect(toggleModuleHidden(once, "tasks").hidden).toEqual([]);
  });
});

/* ================================================================== */
/* reorder                                                             */
/* ================================================================== */
describe("moveModule", () => {
  it("moves to the front", () => {
    expect(moveModule(defaultModulePrefs(), "messages", 0).order).toEqual([
      "messages",
      "week",
      "tasks",
    ]);
  });
  it("moves to the end", () => {
    expect(moveModule(defaultModulePrefs(), "week", 2).order).toEqual(["tasks", "messages", "week"]);
  });
  it("moves to the middle", () => {
    expect(moveModule(defaultModulePrefs(), "week", 1).order).toEqual(["tasks", "week", "messages"]);
  });
  it("clamps a negative index to 0", () => {
    expect(moveModule(defaultModulePrefs(), "messages", -5).order).toEqual([
      "messages",
      "week",
      "tasks",
    ]);
  });
  it("clamps an over-large index to the end", () => {
    expect(moveModule(defaultModulePrefs(), "week", 99).order).toEqual(["tasks", "messages", "week"]);
  });
  it("truncates fractional indices", () => {
    expect(moveModule(defaultModulePrefs(), "messages", 0.9).order).toEqual([
      "messages",
      "week",
      "tasks",
    ]);
  });
  it("unknown id is a no-op (same reference)", () => {
    const p = defaultModulePrefs();
    expect(moveModule(p, "ghost", 0)).toBe(p);
  });
  it("moving to its own position is a no-op (same reference)", () => {
    const p = defaultModulePrefs();
    expect(moveModule(p, "week", 0)).toBe(p);
  });
  it("does not mutate the input order", () => {
    const p = defaultModulePrefs();
    moveModule(p, "week", 2);
    expect(p.order).toEqual(["week", "tasks", "messages"]);
  });
  it("preserves hidden/minimized/layout", () => {
    const p = prefs({ hidden: ["tasks"], minimized: ["week"], layout: "stacked" });
    const moved = moveModule(p, "messages", 0);
    expect(moved.hidden).toEqual(["tasks"]);
    expect(moved.minimized).toEqual(["week"]);
    expect(moved.layout).toBe("stacked");
  });
});

describe("moveModuleBy", () => {
  it("moves down by one", () => {
    expect(moveModuleBy(defaultModulePrefs(), "week", 1).order).toEqual([
      "tasks",
      "week",
      "messages",
    ]);
  });
  it("moves up by one", () => {
    expect(moveModuleBy(defaultModulePrefs(), "messages", -1).order).toEqual([
      "week",
      "messages",
      "tasks",
    ]);
  });
  it("moves down by two", () => {
    expect(moveModuleBy(defaultModulePrefs(), "week", 2).order).toEqual([
      "tasks",
      "messages",
      "week",
    ]);
  });
  it("moving the first up is a no-op", () => {
    const p = defaultModulePrefs();
    expect(moveModuleBy(p, "week", -1)).toBe(p);
  });
  it("moving the last down is a no-op", () => {
    const p = defaultModulePrefs();
    expect(moveModuleBy(p, "messages", 1)).toBe(p);
  });
  it("over-shooting down clamps to no-op", () => {
    const p = defaultModulePrefs();
    expect(moveModuleBy(p, "tasks", 5)).toBe(p);
  });
  it("over-shooting up clamps to no-op", () => {
    const p = defaultModulePrefs();
    expect(moveModuleBy(p, "tasks", -5)).toBe(p);
  });
  it("delta 0 is a no-op", () => {
    const p = defaultModulePrefs();
    expect(moveModuleBy(p, "tasks", 0)).toBe(p);
  });
  it("unknown id is a no-op", () => {
    const p = defaultModulePrefs();
    expect(moveModuleBy(p, "ghost", 1)).toBe(p);
  });
  it("up then down returns to start", () => {
    const down = moveModuleBy(defaultModulePrefs(), "week", 1);
    expect(moveModuleBy(down, "week", -1).order).toEqual(["week", "tasks", "messages"]);
  });
});

/* ================================================================== */
/* minimize / open-by-default                                          */
/* ================================================================== */
describe("setModuleMinimized / toggle / openByDefault", () => {
  it("minimizes a module", () => {
    expect(setModuleMinimized(defaultModulePrefs(), "tasks", true).minimized).toEqual(["tasks"]);
  });
  it("un-minimizes a module", () => {
    expect(setModuleMinimized(prefs({ minimized: ["tasks"] }), "tasks", false).minimized).toEqual([]);
  });
  it("minimize is a no-op when already minimized", () => {
    const p = prefs({ minimized: ["tasks"] });
    expect(setModuleMinimized(p, "tasks", true)).toBe(p);
  });
  it("un-minimize is a no-op when already open", () => {
    const p = defaultModulePrefs();
    expect(setModuleMinimized(p, "tasks", false)).toBe(p);
  });
  it("minimize is a no-op for a hidden module", () => {
    const p = prefs({ hidden: ["tasks"] });
    expect(setModuleMinimized(p, "tasks", true)).toBe(p);
  });
  it("minimize ignores unknown ids", () => {
    const p = defaultModulePrefs();
    expect(setModuleMinimized(p, "ghost", true)).toBe(p);
  });
  it("does not mutate input", () => {
    const p = defaultModulePrefs();
    setModuleMinimized(p, "tasks", true);
    expect(p.minimized).toEqual([]);
  });
  it("toggle minimizes an open module", () => {
    expect(toggleModuleMinimized(defaultModulePrefs(), "week").minimized).toEqual(["week"]);
  });
  it("toggle opens a minimized module", () => {
    expect(toggleModuleMinimized(prefs({ minimized: ["week"] }), "week").minimized).toEqual([]);
  });
  it("toggle twice is identity on contents", () => {
    const once = toggleModuleMinimized(defaultModulePrefs(), "messages");
    expect(toggleModuleMinimized(once, "messages").minimized).toEqual([]);
  });
  it("setModuleOpenByDefault(false) minimizes", () => {
    expect(isMinimized(setModuleOpenByDefault(defaultModulePrefs(), "tasks", false), "tasks")).toBe(
      true,
    );
  });
  it("setModuleOpenByDefault(true) un-minimizes", () => {
    expect(
      isMinimized(setModuleOpenByDefault(prefs({ minimized: ["tasks"] }), "tasks", true), "tasks"),
    ).toBe(false);
  });
  it("open-by-default is consistent with predicate", () => {
    const p = setModuleOpenByDefault(defaultModulePrefs(), "tasks", false);
    expect(isOpenByDefault(p, "tasks")).toBe(false);
  });
});

/* ================================================================== */
/* layout / section / sync                                             */
/* ================================================================== */
describe("setLayoutPreset", () => {
  it("sets stacked", () => {
    expect(setLayoutPreset(defaultModulePrefs(), "stacked").layout).toBe("stacked");
  });
  it("sets split", () => {
    expect(setLayoutPreset(prefs({ layout: "stacked" }), "split").layout).toBe("split");
  });
  it("same value is a no-op (same reference)", () => {
    const p = defaultModulePrefs();
    expect(setLayoutPreset(p, "split")).toBe(p);
  });
  it("invalid value is a no-op", () => {
    const p = defaultModulePrefs();
    expect(setLayoutPreset(p, "grid" as never)).toBe(p);
  });
  it("does not mutate input", () => {
    const p = defaultModulePrefs();
    setLayoutPreset(p, "stacked");
    expect(p.layout).toBe("split");
  });
});

describe("setSectionCollapsed", () => {
  it("collapses", () => {
    expect(setSectionCollapsed(defaultModulePrefs(), true).sectionCollapsed).toBe(true);
  });
  it("expands", () => {
    expect(setSectionCollapsed(prefs({ sectionCollapsed: true }), false).sectionCollapsed).toBe(false);
  });
  it("no-op when unchanged", () => {
    const p = defaultModulePrefs();
    expect(setSectionCollapsed(p, false)).toBe(p);
  });
});

describe("setSync", () => {
  it("enables sync", () => {
    expect(setSync(defaultModulePrefs(), true).sync).toBe(true);
  });
  it("disables sync", () => {
    expect(setSync(prefs({ sync: true }), false).sync).toBe(false);
  });
  it("no-op when unchanged", () => {
    const p = defaultModulePrefs();
    expect(setSync(p, false)).toBe(p);
  });
});

/* ================================================================== */
/* reset                                                               */
/* ================================================================== */
describe("resetModulePrefs", () => {
  it("with no arg returns defaults", () => {
    expect(resetModulePrefs()).toEqual(defaultModulePrefs());
  });
  it("clears order/hidden/minimized/layout/collapse", () => {
    const messy = prefs({
      order: ["messages", "tasks", "week"],
      hidden: ["tasks"],
      minimized: ["week"],
      layout: "stacked",
      sectionCollapsed: true,
    });
    const reset = resetModulePrefs(messy);
    expect(reset.order).toEqual(["week", "tasks", "messages"]);
    expect(reset.hidden).toEqual([]);
    expect(reset.minimized).toEqual([]);
    expect(reset.layout).toBe("split");
    expect(reset.sectionCollapsed).toBe(false);
  });
  it("preserves sync by default", () => {
    expect(resetModulePrefs(prefs({ sync: true })).sync).toBe(true);
  });
  it("can drop sync when keepSync=false", () => {
    expect(resetModulePrefs(prefs({ sync: true }), { keepSync: false }).sync).toBe(false);
  });
  it("does not mutate the previous prefs", () => {
    const messy = prefs({ hidden: ["tasks"] });
    resetModulePrefs(messy);
    expect(messy.hidden).toEqual(["tasks"]);
  });
});

/* ================================================================== */
/* layout mapping                                                      */
/* ================================================================== */
describe("presetToDashLayout", () => {
  it("stacked puts everything in center", () => {
    expect(presetToDashLayout("stacked", ["week", "tasks", "messages"])).toEqual({
      center: ["week", "tasks", "messages"],
      right: [],
    });
  });
  it("stacked of one", () => {
    expect(presetToDashLayout("stacked", ["tasks"])).toEqual({ center: ["tasks"], right: [] });
  });
  it("stacked of none", () => {
    expect(presetToDashLayout("stacked", [])).toEqual({ center: [], right: [] });
  });
  it("split of three matches the default layout", () => {
    expect(presetToDashLayout("split", ["week", "tasks", "messages"])).toEqual({
      center: ["week", "tasks"],
      right: ["messages"],
    });
  });
  it("split of two", () => {
    expect(presetToDashLayout("split", ["week", "tasks"])).toEqual({
      center: ["week"],
      right: ["tasks"],
    });
  });
  it("split of four", () => {
    expect(presetToDashLayout("split", ["a", "b", "c", "d"])).toEqual({
      center: ["a", "b"],
      right: ["c", "d"],
    });
  });
  it("split of one keeps it in center", () => {
    expect(presetToDashLayout("split", ["tasks"])).toEqual({ center: ["tasks"], right: [] });
  });
  it("split of none", () => {
    expect(presetToDashLayout("split", [])).toEqual({ center: [], right: [] });
  });
  it("does not share the input array", () => {
    const ids = ["week", "tasks"];
    const out = presetToDashLayout("stacked", ids);
    out.center.push("x");
    expect(ids).toEqual(["week", "tasks"]);
  });
});

describe("dashLayoutForPrefs", () => {
  it("default prefs → split of all three", () => {
    expect(dashLayoutForPrefs(defaultModulePrefs())).toEqual({
      center: ["week", "tasks"],
      right: ["messages"],
    });
  });
  it("stacked layout", () => {
    expect(dashLayoutForPrefs(prefs({ layout: "stacked" }))).toEqual({
      center: ["week", "tasks", "messages"],
      right: [],
    });
  });
  it("hidden module drops out of the layout", () => {
    expect(dashLayoutForPrefs(prefs({ hidden: ["messages"] }))).toEqual({
      center: ["week"],
      right: ["tasks"],
    });
  });
  it("reorder changes the columns", () => {
    expect(dashLayoutForPrefs(prefs({ order: ["messages", "tasks", "week"] }))).toEqual({
      center: ["messages", "tasks"],
      right: ["week"],
    });
  });
});

/* ================================================================== */
/* serialize / equality                                                */
/* ================================================================== */
describe("serializeModulePrefs", () => {
  it("returns a normalized object", () => {
    expect(serializeModulePrefs(prefs({ order: ["tasks"] })).order).toEqual([
      "tasks",
      "week",
      "messages",
    ]);
  });
  it("round-trips through JSON", () => {
    const p = prefs({ hidden: ["tasks"], minimized: ["week"], layout: "stacked", sync: true });
    const round = parseModulePrefs(JSON.parse(JSON.stringify(serializeModulePrefs(p))));
    expect(modulePrefsEqual(round, p)).toBe(true);
  });
});

describe("modulePrefsEqual", () => {
  it("equal defaults", () => {
    expect(modulePrefsEqual(defaultModulePrefs(), defaultModulePrefs())).toBe(true);
  });
  it("different order → not equal", () => {
    expect(modulePrefsEqual(defaultModulePrefs(), prefs({ order: ["tasks", "week", "messages"] }))).toBe(
      false,
    );
  });
  it("hidden compared as a set (order-insensitive)", () => {
    expect(
      modulePrefsEqual(prefs({ hidden: ["week", "tasks"] }), prefs({ hidden: ["tasks", "week"] })),
    ).toBe(true);
  });
  it("different hidden contents → not equal", () => {
    expect(modulePrefsEqual(prefs({ hidden: ["week"] }), prefs({ hidden: ["tasks"] }))).toBe(false);
  });
  it("minimized order matters", () => {
    expect(
      modulePrefsEqual(prefs({ minimized: ["week", "tasks"] }), prefs({ minimized: ["tasks", "week"] })),
    ).toBe(false);
  });
  it("different layout → not equal", () => {
    expect(modulePrefsEqual(defaultModulePrefs(), prefs({ layout: "stacked" }))).toBe(false);
  });
  it("different sectionCollapsed → not equal", () => {
    expect(modulePrefsEqual(defaultModulePrefs(), prefs({ sectionCollapsed: true }))).toBe(false);
  });
  it("different sync → not equal", () => {
    expect(modulePrefsEqual(defaultModulePrefs(), prefs({ sync: true }))).toBe(false);
  });
  it("different hidden length → not equal", () => {
    expect(modulePrefsEqual(prefs({ hidden: [] }), prefs({ hidden: ["week"] }))).toBe(false);
  });
});

/* ================================================================== */
/* integration-ish: realistic sequences                                */
/* ================================================================== */
describe("realistic sequences", () => {
  it("hide then show restores active set", () => {
    let p = defaultModulePrefs();
    p = hideModule(p, "messages");
    expect(activeModuleIds(p)).toEqual(["week", "tasks"]);
    p = showModule(p, "messages");
    expect(activeModuleIds(p)).toEqual(["week", "tasks", "messages"]);
  });
  it("reorder then hide keeps the new order on the rest", () => {
    let p = moveModule(defaultModulePrefs(), "messages", 0);
    p = hideModule(p, "week");
    expect(activeModuleIds(p)).toEqual(["messages", "tasks"]);
  });
  it("minimize survives a reorder", () => {
    let p = setModuleMinimized(defaultModulePrefs(), "tasks", true);
    p = moveModule(p, "tasks", 0);
    expect(isMinimized(p, "tasks")).toBe(true);
    expect(p.order[0]).toBe("tasks");
  });
  it("hiding a minimized module clears minimized, showing it starts open", () => {
    let p = setModuleMinimized(defaultModulePrefs(), "tasks", true);
    p = hideModule(p, "tasks");
    expect(isMinimized(p, "tasks")).toBe(false);
    p = showModule(p, "tasks");
    expect(isOpenByDefault(p, "tasks")).toBe(true);
  });
  it("reset after heavy customization returns to stock (keeping sync)", () => {
    let p = defaultModulePrefs();
    p = setSync(p, true);
    p = hideModule(p, "messages");
    p = moveModule(p, "tasks", 0);
    p = setModuleMinimized(p, "week", true);
    p = setLayoutPreset(p, "stacked");
    p = setSectionCollapsed(p, true);
    const reset = resetModulePrefs(p);
    expect(reset).toEqual({ ...defaultModulePrefs(), sync: true });
  });
  it("layout reflects a hide + reorder + stacked sequence", () => {
    let p = defaultModulePrefs();
    p = setLayoutPreset(p, "stacked");
    p = hideModule(p, "week");
    expect(dashLayoutForPrefs(p)).toEqual({ center: ["tasks", "messages"], right: [] });
  });
});
