import { describe, expect, it } from "vitest";
import { validateRecurrenceRule } from "./task-recurrence";

describe("validateRecurrenceRule", () => {
  it("returns null for explicit null (caller is clearing the rule)", () => {
    expect(validateRecurrenceRule(null)).toBeNull();
  });

  it("accepts a minimal daily rule", () => {
    const result = validateRecurrenceRule({ pattern: "daily", interval: 1 });
    expect(result).toEqual({ pattern: "daily", interval: 1 });
  });

  it("accepts a weekly rule with weekdays + end_date", () => {
    const result = validateRecurrenceRule({
      pattern: "weekly",
      interval: 2,
      weekdays: [1, 3, 5],
      end_date: "2026-12-31",
    });
    expect(result).toMatchObject({
      pattern: "weekly",
      interval: 2,
      weekdays: [1, 3, 5],
      end_date: "2026-12-31",
    });
  });

  it("accepts a monthly rule", () => {
    expect(validateRecurrenceRule({ pattern: "monthly", interval: 1 })).toEqual({
      pattern: "monthly",
      interval: 1,
    });
  });

  it("rejects unknown pattern", () => {
    expect(
      validateRecurrenceRule({ pattern: "yearly", interval: 1 }),
    ).toBe("invalid");
  });

  it("rejects non-integer interval", () => {
    expect(validateRecurrenceRule({ pattern: "daily", interval: 1.5 })).toBe(
      "invalid",
    );
    expect(validateRecurrenceRule({ pattern: "daily", interval: 0 })).toBe(
      "invalid",
    );
    expect(validateRecurrenceRule({ pattern: "daily", interval: "1" })).toBe(
      "invalid",
    );
  });

  it("rejects out-of-range weekdays", () => {
    expect(
      validateRecurrenceRule({ pattern: "weekly", interval: 1, weekdays: [7] }),
    ).toBe("invalid");
    expect(
      validateRecurrenceRule({ pattern: "weekly", interval: 1, weekdays: [-1] }),
    ).toBe("invalid");
  });

  it("rejects malformed end_date", () => {
    expect(
      validateRecurrenceRule({
        pattern: "daily",
        interval: 1,
        end_date: "tomorrow",
      }),
    ).toBe("invalid");
  });

  it("rejects non-object inputs", () => {
    expect(validateRecurrenceRule("daily")).toBe("invalid");
    expect(validateRecurrenceRule(42)).toBe("invalid");
    expect(validateRecurrenceRule([])).toBe("invalid");
  });
});
