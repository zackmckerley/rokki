import { describe, it, expect } from "vitest";
import {
  DEFAULT_DASH_LAYOUT,
  flattenLayout,
  movePanel,
  normalizeLayout,
  gridTemplate,
} from "./dashboard-layout";

describe("movePanel", () => {
  it("moves a panel from one column to another at an index", () => {
    const out = movePanel(DEFAULT_DASH_LAYOUT, "messages", "center", 1);
    expect(out).toEqual({ center: ["week", "messages", "tasks"], right: [] });
  });

  it("reorders within a column (down)", () => {
    const out = movePanel(DEFAULT_DASH_LAYOUT, "week", "center", 2);
    // week removed from idx0, tasks shifts up, week appended after tasks
    expect(out.center).toEqual(["tasks", "week"]);
  });

  it("reorders within a column (up)", () => {
    const l = { center: ["week", "tasks", "messages"], right: [] as string[] };
    expect(movePanel(l, "messages", "center", 0).center).toEqual([
      "messages",
      "week",
      "tasks",
    ]);
  });

  it("does not mutate the input", () => {
    const l = { center: ["week", "tasks"], right: ["messages"] };
    movePanel(l, "tasks", "right", 0);
    expect(l).toEqual({ center: ["week", "tasks"], right: ["messages"] });
  });
});

describe("normalizeLayout", () => {
  it("returns the default-shaped layout when given nothing", () => {
    expect(normalizeLayout(null)).toEqual({
      center: ["week", "tasks", "messages"],
      right: [],
    });
  });

  it("preserves a valid layout", () => {
    expect(normalizeLayout(DEFAULT_DASH_LAYOUT)).toEqual(DEFAULT_DASH_LAYOUT);
  });

  it("drops unknown ids and dedupes", () => {
    const out = normalizeLayout({
      center: ["week", "ghost", "week"],
      right: ["messages", "tasks", "messages"],
    });
    expect(out).toEqual({ center: ["week"], right: ["messages", "tasks"] });
  });

  it("appends a missing known panel to center (nothing disappears)", () => {
    const out = normalizeLayout({ center: ["tasks"], right: ["messages"] });
    expect(out.center).toContain("week");
    expect(flattenLayout(out).sort()).toEqual(["messages", "tasks", "week"]);
  });
});

describe("gridTemplate", () => {
  it("renders two columns when both occupied", () => {
    expect(gridTemplate(DEFAULT_DASH_LAYOUT, 0.6)).toBe("0.6fr 9px 0.4fr");
  });

  it("collapses to full width when the right column is empty", () => {
    expect(gridTemplate({ center: ["week", "tasks", "messages"], right: [] }, 0.6)).toBe(
      "1fr 0 0",
    );
  });

  it("collapses to full width when the center column is empty", () => {
    expect(gridTemplate({ center: [], right: ["week", "tasks", "messages"] }, 0.6)).toBe(
      "0 0 1fr",
    );
  });

  it("forceTwo keeps both columns visible even when one is empty", () => {
    expect(gridTemplate({ center: [], right: ["week"] }, 0.6, true)).toBe(
      "0.6fr 9px 0.4fr",
    );
  });

  it("clamps the center fraction to a sane range", () => {
    expect(gridTemplate(DEFAULT_DASH_LAYOUT, 0.95)).toBe("0.8fr 9px 0.19999999999999996fr");
    expect(gridTemplate(DEFAULT_DASH_LAYOUT, 0.05)).toBe("0.2fr 9px 0.8fr");
  });
});
