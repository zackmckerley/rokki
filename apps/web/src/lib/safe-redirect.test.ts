import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("allows same-origin absolute paths", () => {
    expect(safeRedirectPath("/")).toBe("/");
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/p/ACME?tab=files#x")).toBe("/p/ACME?tab=files#x");
  });
  it("blocks absolute URLs and protocol-relative targets", () => {
    expect(safeRedirectPath("https://evil.com")).toBe("/");
    expect(safeRedirectPath("http://evil.com")).toBe("/");
    expect(safeRedirectPath("//evil.com")).toBe("/");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/");
  });
  it("blocks backslash and encoded-slash tricks", () => {
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
    expect(safeRedirectPath("/path\\x")).toBe("/");
    expect(safeRedirectPath("/%2f%2fevil.com")).toBe("/");
    expect(safeRedirectPath("/%5cevil.com")).toBe("/");
  });
  it("blocks control characters", () => {
    expect(safeRedirectPath("/a\nb")).toBe("/");
    expect(safeRedirectPath("/a\tb")).toBe("/");
  });
  it("falls back for empty / non-string", () => {
    expect(safeRedirectPath(null)).toBe("/");
    expect(safeRedirectPath(undefined)).toBe("/");
    expect(safeRedirectPath("")).toBe("/");
    expect(safeRedirectPath("relative/no/slash")).toBe("/");
  });
  it("honors a custom fallback", () => {
    expect(safeRedirectPath("https://evil.com", "/login")).toBe("/login");
  });
});
