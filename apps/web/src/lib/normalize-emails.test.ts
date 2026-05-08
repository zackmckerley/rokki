import { describe, expect, it } from "vitest";
import { normalizeEmails } from "./normalize-emails";

describe("normalizeEmails", () => {
  it("trims whitespace and lower-cases", () => {
    expect(normalizeEmails(["  ZackM@trumpgroup.com  "])).toEqual([
      "zackm@trumpgroup.com",
    ]);
  });

  it("dedupes case-insensitively", () => {
    expect(
      normalizeEmails(["a@b.com", "A@B.COM", "  a@b.com"]),
    ).toEqual(["a@b.com"]);
  });

  it("drops empty / whitespace-only entries silently", () => {
    expect(
      normalizeEmails(["a@b.com", "", "   ", "\t"]),
    ).toEqual(["a@b.com"]);
  });

  it("returns 'invalid' on a garbage entry", () => {
    expect(normalizeEmails(["not-an-email"])).toBe("invalid");
    expect(normalizeEmails(["a@b.com", "@@@"])).toBe("invalid");
    expect(normalizeEmails(["a @b.com"])).toBe("invalid"); // space in local
  });

  it("returns 'invalid' when input isn't an array", () => {
    expect(normalizeEmails("a@b.com")).toBe("invalid");
    expect(normalizeEmails(null)).toBe("invalid");
    expect(normalizeEmails(undefined)).toBe("invalid");
    expect(normalizeEmails({ 0: "a@b.com" })).toBe("invalid");
  });

  it("ignores non-string array entries (skips silently)", () => {
    expect(
      normalizeEmails(["a@b.com", null, 42, undefined, "c@d.com"]),
    ).toEqual(["a@b.com", "c@d.com"]);
  });

  it("returns empty array for empty input", () => {
    expect(normalizeEmails([])).toEqual([]);
  });

  it("accepts subdomains, plus addressing, dashes", () => {
    expect(
      normalizeEmails([
        "ann+filter@helios.co",
        "first.last@sub.example.com",
        "user-name@x.io",
      ]),
    ).toEqual([
      "ann+filter@helios.co",
      "first.last@sub.example.com",
      "user-name@x.io",
    ]);
  });
});
