import { describe, it, expect } from "vitest";
import {
  getEmailForUsername,
  getUsernameForEmail,
  listUsernames,
} from "./usernames";

describe("usernames", () => {
  describe("getEmailForUsername", () => {
    it("maps a known username to its pseudo-email", () => {
      expect(getEmailForUsername("admin")).toBe("admin@rokki.local");
    });
    it("normalizes case + whitespace", () => {
      expect(getEmailForUsername("  ADMIN ")).toBe("admin@rokki.local");
    });
    it("returns undefined for unknown usernames", () => {
      expect(getEmailForUsername("zack")).toBeUndefined();
      expect(getEmailForUsername("")).toBeUndefined();
    });
    it("does not allow prototype-pollution lookups", () => {
      expect(getEmailForUsername("toString")).toBeUndefined();
      expect(getEmailForUsername("__proto__")).toBeUndefined();
    });
  });

  describe("getUsernameForEmail", () => {
    it("reverses a known mapping", () => {
      expect(getUsernameForEmail("admin@rokki.local")).toBe("admin");
    });
    it("is case-insensitive", () => {
      expect(getUsernameForEmail("Admin@Rokki.Local")).toBe("admin");
    });
    it("trims whitespace", () => {
      expect(getUsernameForEmail("  admin@rokki.local  ")).toBe("admin");
    });
    it("returns null for unmapped emails", () => {
      expect(getUsernameForEmail("zack@rokki.ai")).toBeNull();
    });
    it("returns null for empty input", () => {
      expect(getUsernameForEmail("")).toBeNull();
    });
  });

  describe("listUsernames", () => {
    it("returns all allow-listed usernames", () => {
      expect(listUsernames()).toContain("admin");
    });
  });
});
