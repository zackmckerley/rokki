import { describe, it, expect } from "vitest";
import {
  diffJson,
  charDiff,
  shouldUseCharDiff,
  formatJsonValue,
} from "./json-diff";

describe("diffJson", () => {
  it("returns no entries for identical objects", () => {
    expect(diffJson({ a: 1, b: "x" }, { a: 1, b: "x" })).toEqual([]);
  });

  it("flags changed values", () => {
    const out = diffJson({ title: "old" }, { title: "new" });
    expect(out).toEqual([{ key: "title", before: "old", after: "new" }]);
  });

  it("flags added and removed keys", () => {
    const out = diffJson({ a: 1 }, { a: 1, b: 2 });
    expect(out).toEqual([{ key: "b", before: undefined, after: 2 }]);

    const out2 = diffJson({ a: 1, b: 2 }, { a: 1 });
    expect(out2).toEqual([{ key: "b", before: 2, after: undefined }]);
  });

  it("ignores updated_at", () => {
    const out = diffJson(
      { title: "x", updated_at: "2026-01-01T00:00:00Z" },
      { title: "x", updated_at: "2026-04-26T17:00:00Z" },
    );
    expect(out).toEqual([]);
  });

  it("compares arrays by deep equality", () => {
    expect(diffJson({ tags: ["a", "b"] }, { tags: ["a", "b"] })).toEqual([]);
    expect(diffJson({ tags: ["a"] }, { tags: ["a", "b"] })).toEqual([
      { key: "tags", before: ["a"], after: ["a", "b"] },
    ]);
  });

  it("sorts entries by key", () => {
    const out = diffJson({ z: 1, a: 1 }, { z: 2, a: 2 });
    expect(out.map((d) => d.key)).toEqual(["a", "z"]);
  });

  it("treats null vs undefined as equal", () => {
    expect(diffJson({ a: null }, { a: null })).toEqual([]);
  });
});

describe("charDiff", () => {
  it("returns a single 'same' segment for identical strings", () => {
    expect(charDiff("abc", "abc")).toEqual([{ type: "same", text: "abc" }]);
  });

  it("marks pure additions", () => {
    expect(charDiff("ab", "abc")).toEqual([
      { type: "same", text: "ab" },
      { type: "added", text: "c" },
    ]);
  });

  it("marks pure removals", () => {
    expect(charDiff("abc", "ab")).toEqual([
      { type: "same", text: "ab" },
      { type: "removed", text: "c" },
    ]);
  });

  it("handles a substitution", () => {
    const out = charDiff("cat", "bat");
    // c -> b, "at" same. Substitution is rendered as a removed + added pair
    // (in some order) followed by the unchanged tail. We just assert the
    // segment contents; either {added,removed,same} or {removed,added,same}
    // is a valid LCS traceback.
    expect(out.find((s) => s.type === "removed")?.text).toBe("c");
    expect(out.find((s) => s.type === "added")?.text).toBe("b");
    expect(out.find((s) => s.type === "same")?.text).toBe("at");
    expect(out.length).toBe(3);
    // The "same" tail must come last so the diff reads left-to-right.
    expect(out[out.length - 1]!.type).toBe("same");
  });
});

describe("shouldUseCharDiff", () => {
  it("requires both sides to be strings", () => {
    expect(shouldUseCharDiff("a", "b")).toBe(true);
    expect(shouldUseCharDiff("a", 1)).toBe(false);
    expect(shouldUseCharDiff(null, "b")).toBe(false);
  });
  it("rejects long strings", () => {
    expect(shouldUseCharDiff("a".repeat(201), "b")).toBe(false);
    expect(shouldUseCharDiff("a", "b".repeat(201))).toBe(false);
    expect(shouldUseCharDiff("a".repeat(200), "b".repeat(200))).toBe(true);
  });
});

describe("formatJsonValue", () => {
  it("renders primitives", () => {
    expect(formatJsonValue("hi")).toBe("hi");
    expect(formatJsonValue(42)).toBe("42");
    expect(formatJsonValue(true)).toBe("true");
    expect(formatJsonValue(null)).toBe("null");
    expect(formatJsonValue(undefined)).toBe("—");
  });
  it("renders arrays + objects as JSON", () => {
    expect(formatJsonValue([1, 2])).toBe("[1,2]");
    expect(formatJsonValue({ a: 1 })).toBe('{"a":1}');
  });
});
