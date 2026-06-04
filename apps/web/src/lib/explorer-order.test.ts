import { describe, it, expect } from "vitest";
import { applyOrder, reorder } from "./explorer-order";

const id = (x: { id: string }) => x.id;
const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

describe("applyOrder", () => {
  it("returns items unchanged when no saved order", () => {
    expect(applyOrder(items, id, []).map(id)).toEqual(["a", "b", "c", "d"]);
  });

  it("applies a full saved order", () => {
    expect(applyOrder(items, id, ["c", "a", "d", "b"]).map(id)).toEqual([
      "c",
      "a",
      "d",
      "b",
    ]);
  });

  it("sinks unknown (newly added) items to the end in original order", () => {
    // Only b and d are in the saved order; a and c are new.
    expect(applyOrder(items, id, ["d", "b"]).map(id)).toEqual([
      "d",
      "b",
      "a",
      "c",
    ]);
  });

  it("ignores stale ids in the saved order", () => {
    expect(applyOrder(items, id, ["zzz", "b", "a"]).map(id)).toEqual([
      "b",
      "a",
      "c",
      "d",
    ]);
  });
});

describe("reorder", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves an item to just before the target", () => {
    expect(reorder(ids, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("moves an item earlier→later correctly", () => {
    expect(reorder(ids, "a", "c")).toEqual(["b", "a", "c", "d"]);
  });

  it("drops to the end when target is null", () => {
    expect(reorder(ids, "b", null)).toEqual(["a", "c", "d", "b"]);
  });

  it("is a no-op-ish move when dropping onto itself (sends to end)", () => {
    expect(reorder(ids, "b", "b")).toEqual(["a", "c", "d", "b"]);
  });

  it("appends when the target is unknown", () => {
    expect(reorder(ids, "a", "zzz")).toEqual(["b", "c", "d", "a"]);
  });
});
