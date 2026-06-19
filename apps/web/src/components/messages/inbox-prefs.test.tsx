// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { filterThreads, UnreadBadge } from "./inbox-prefs";

afterEach(() => cleanup());

const threads = [
  { id: "a", source: "rokki" as const },
  { id: "b", source: "signal" as const },
  { id: "c", source: "rokki" as const },
];

describe("filterThreads", () => {
  it("'all' returns everything except hidden, and counts the hidden", () => {
    const { visible, hiddenInFilter } = filterThreads(
      threads,
      "all",
      new Set(["c"]),
    );
    expect(visible.map((t) => t.id)).toEqual(["a", "b"]);
    expect(hiddenInFilter).toBe(1);
  });

  it("'signal' returns only Signal threads", () => {
    const { visible } = filterThreads(threads, "signal", new Set());
    expect(visible.map((t) => t.id)).toEqual(["b"]);
  });

  it("'rokki' treats a missing source as native", () => {
    const { visible } = filterThreads(
      [{ id: "x" }, { id: "y", source: "signal" as const }],
      "rokki",
      new Set(),
    );
    expect(visible.map((t) => t.id)).toEqual(["x"]);
  });

  it("hiddenInFilter counts only hidden items within the active filter", () => {
    // 'a' is a rokki thread, hidden — but the signal filter doesn't include it.
    const { hiddenInFilter } = filterThreads(threads, "signal", new Set(["a"]));
    expect(hiddenInFilter).toBe(0);
  });
});

describe("filterThreads search", () => {
  const labeled = [
    { id: "a", source: "rokki" as const, label: "Carlos" },
    { id: "b", source: "signal" as const, label: "Mom" },
    { id: "c", source: "rokki" as const, label: "Maria" },
  ];
  it("filters by label substring, case-insensitive", () => {
    const { visible } = filterThreads(labeled, "all", new Set(), "MAR");
    expect(visible.map((t) => t.id)).toEqual(["c"]);
  });
  it("combines with the source filter", () => {
    const { visible } = filterThreads(labeled, "rokki", new Set(), "ca");
    expect(visible.map((t) => t.id)).toEqual(["a"]);
  });
  it("an empty query returns everything in the filter", () => {
    expect(filterThreads(labeled, "all", new Set(), "").visible.length).toBe(3);
  });
  it("hiddenInFilter is independent of the query", () => {
    const { hiddenInFilter } = filterThreads(
      labeled,
      "all",
      new Set(["a"]),
      "zzz",
    );
    expect(hiddenInFilter).toBe(1);
  });
});

describe("UnreadBadge", () => {
  it("renders the count when > 0", () => {
    render(<UnreadBadge count={5} />);
    expect(screen.getByText("5")).toBeTruthy();
  });
  it("caps at 99+", () => {
    render(<UnreadBadge count={250} />);
    expect(screen.getByText("99+")).toBeTruthy();
  });
  it("renders nothing at 0 / undefined", () => {
    const { container } = render(<UnreadBadge count={0} />);
    expect(container.textContent).toBe("");
  });
});
