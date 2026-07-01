import { describe, it, expect } from "vitest";
import { moveBefore } from "./goals-queries";

describe("moveBefore", () => {
  const ids = ["a", "b", "c", "d"];
  it("moves an item earlier (before target)", () => {
    expect(moveBefore(ids, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });
  it("moves an item later (before target)", () => {
    expect(moveBefore(ids, "a", "d")).toEqual(["b", "c", "a", "d"]);
  });
  it("no-op when drag === target", () => {
    expect(moveBefore(ids, "b", "b")).toBe(ids);
  });
  it("no-op when target is unknown", () => {
    expect(moveBefore(ids, "a", "z")).toBe(ids);
  });
  it("moving before the first keeps it first", () => {
    expect(moveBefore(ids, "c", "a")).toEqual(["c", "a", "b", "d"]);
  });
});
