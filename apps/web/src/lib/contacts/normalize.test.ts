import { describe, it, expect } from "vitest";
import {
  normalizeEmail,
  normalizePhone,
  primaryEmail,
  primaryPhone,
  displayName,
  hasName,
} from "./normalize";

describe("normalizeEmail/Phone", () => {
  it("lower-cases + trims emails", () => {
    expect(normalizeEmail("  Broker@Realty.COM ")).toBe("broker@realty.com");
  });
  it("keeps digits + a leading +", () => {
    expect(normalizePhone("(305) 555-1212")).toBe("3055551212");
    expect(normalizePhone("+1 305-555-1212")).toBe("+13055551212");
  });
});

describe("primaryEmail/Phone", () => {
  it("prefers the flagged primary, else the first", () => {
    expect(
      primaryEmail([
        { email: "a@x.com" },
        { email: "B@X.com", primary: true },
      ]),
    ).toBe("b@x.com");
    expect(primaryEmail([{ email: "a@x.com" }])).toBe("a@x.com");
    expect(primaryEmail([])).toBeNull();
    expect(primaryEmail(undefined)).toBeNull();
  });
  it("normalizes the chosen phone", () => {
    expect(primaryPhone([{ phone: "(305) 555-1212", primary: true }])).toBe(
      "3055551212",
    );
    expect(primaryPhone(undefined)).toBeNull();
  });
});

describe("displayName / hasName", () => {
  it("nickname wins, then full name, then email", () => {
    expect(displayName({ first_name: "Bob", last_name: "Jones" })).toBe("Bob Jones");
    expect(displayName({ first_name: "Bob", nickname: "BJ" })).toBe("BJ");
    expect(displayName({ primary_email: "x@y.com" })).toBe("x@y.com");
    expect(displayName({})).toBe("Unnamed");
  });
  it("hasName mirrors the DB check", () => {
    expect(hasName({ first_name: "Bob" })).toBe(true);
    expect(hasName({ nickname: "BJ" })).toBe(true);
    expect(hasName({ first_name: " ", last_name: "" })).toBe(false);
    expect(hasName({})).toBe(false);
  });
});
