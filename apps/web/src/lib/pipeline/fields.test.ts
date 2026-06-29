import { describe, it, expect } from "vitest";
import { slugifyKey, uniqueKey } from "./fields";

describe("slugifyKey", () => {
  it("lowercases and underscores", () => {
    expect(slugifyKey("Price per door")).toBe("price_per_door");
    expect(slugifyKey("Folio / APN")).toBe("folio_apn");
    expect(slugifyKey("  Submarket  ")).toBe("submarket");
  });
  it("falls back for empty/symbol-only labels", () => {
    expect(slugifyKey("")).toBe("field");
    expect(slugifyKey("$$$")).toBe("field");
  });
});

describe("uniqueKey", () => {
  it("returns the base when free", () => {
    expect(uniqueKey("city", new Set())).toBe("city");
  });
  it("suffixes when taken", () => {
    expect(uniqueKey("city", new Set(["city"]))).toBe("city_2");
    expect(uniqueKey("city", new Set(["city", "city_2"]))).toBe("city_3");
  });
});
