import { describe, it, expect } from "vitest";
import {
  basenameOf,
  breadcrumbOf,
  isValidFolderName,
  joinPath,
  normalizePath,
  parentOf,
} from "./folder-path";

describe("folder-path", () => {
  describe("isValidFolderName", () => {
    it("accepts normal names", () => {
      expect(isValidFolderName("drawings")).toBe(true);
      expect(isValidFolderName("2024 Q1")).toBe(true);
      expect(isValidFolderName("R&D (draft)")).toBe(true);
      expect(isValidFolderName("ABC_123.v2")).toBe(true);
    });
    it("rejects slash", () => {
      expect(isValidFolderName("a/b")).toBe(false);
    });
    it("rejects empty and oversized", () => {
      expect(isValidFolderName("")).toBe(false);
      expect(isValidFolderName("x".repeat(61))).toBe(false);
    });
    it("rejects disallowed punctuation", () => {
      expect(isValidFolderName("a@b")).toBe(false);
      expect(isValidFolderName("a*")).toBe(false);
    });
    it("accepts Unicode letters", () => {
      expect(isValidFolderName("über")).toBe(true);
      expect(isValidFolderName("文件")).toBe(true);
    });
  });

  describe("normalizePath", () => {
    it("collapses double slashes and strips trailing", () => {
      expect(normalizePath("/foo//bar/")).toBe("/foo/bar");
    });
    it("keeps the root slash", () => {
      expect(normalizePath("/")).toBe("/");
      expect(normalizePath("")).toBe("/");
    });
    it("prepends slash if missing", () => {
      expect(normalizePath("foo")).toBe("/foo");
    });
  });

  describe("joinPath", () => {
    it("joins root + name", () => {
      expect(joinPath("/", "drawings")).toBe("/drawings");
    });
    it("joins nested + name", () => {
      expect(joinPath("/drawings", "2024")).toBe("/drawings/2024");
      expect(joinPath("/a/b/", "c")).toBe("/a/b/c");
    });
  });

  describe("parentOf", () => {
    it("returns root for top-level children", () => {
      expect(parentOf("/drawings")).toBe("/");
    });
    it("returns the parent for nested", () => {
      expect(parentOf("/a/b/c")).toBe("/a/b");
    });
    it("is idempotent for root", () => {
      expect(parentOf("/")).toBe("/");
    });
  });

  describe("basenameOf", () => {
    it("returns the last segment", () => {
      expect(basenameOf("/a/b/c")).toBe("c");
    });
    it("returns empty for root", () => {
      expect(basenameOf("/")).toBe("");
    });
  });

  describe("breadcrumbOf", () => {
    it("returns just Files for root", () => {
      expect(breadcrumbOf("/")).toEqual([{ name: "Files", path: "/" }]);
    });
    it("builds cumulative segments", () => {
      expect(breadcrumbOf("/a/b")).toEqual([
        { name: "Files", path: "/" },
        { name: "a", path: "/a" },
        { name: "b", path: "/a/b" },
      ]);
    });
  });
});
