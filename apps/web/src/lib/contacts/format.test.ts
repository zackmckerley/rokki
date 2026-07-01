import { describe, it, expect } from "vitest";
import { timeAgo, formatBirthday, formatPhone } from "./format";

describe("timeAgo", () => {
  const now = Date.parse("2026-06-28T12:00:00Z");
  it("renders buckets from seconds to years", () => {
    expect(timeAgo("2026-06-28T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-06-28T11:30:00Z", now)).toBe("30m ago");
    expect(timeAgo("2026-06-28T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-06-24T12:00:00Z", now)).toBe("4d ago");
    expect(timeAgo("2026-04-29T12:00:00Z", now)).toBe("2mo ago");
    expect(timeAgo("2024-06-28T12:00:00Z", now)).toBe("2y ago");
  });
  it("is empty for null / unparseable", () => {
    expect(timeAgo(null, now)).toBe("");
    expect(timeAgo("not-a-date", now)).toBe("");
  });
});

describe("formatBirthday", () => {
  it("formats with and without year", () => {
    expect(formatBirthday("1985-03-09")).toBe("Mar 9, 1985");
    expect(formatBirthday("0000-12-25")).toBe("Dec 25");
  });
  it("rejects junk", () => {
    expect(formatBirthday(null)).toBe("");
    expect(formatBirthday("1985/03/09")).toBe("");
    expect(formatBirthday("1985-13-40")).toBe("");
  });
});

describe("formatPhone", () => {
  it("formats a 10-digit NANP number", () => {
    expect(formatPhone("4109253814")).toBe("(410) 925-3814");
    expect(formatPhone("(410) 925-3814")).toBe("(410) 925-3814");
  });
  it("formats an 11-digit +1 number", () => {
    expect(formatPhone("14109253814")).toBe("+1 (410) 925-3814");
    expect(formatPhone("+1 410-925-3814")).toBe("+1 (410) 925-3814");
  });
  it("leaves non-NANP input as typed", () => {
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(formatPhone("611")).toBe("611");
    expect(formatPhone("")).toBe("");
    expect(formatPhone(null)).toBe("");
  });
});
