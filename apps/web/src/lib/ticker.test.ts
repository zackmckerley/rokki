import { describe, it, expect } from "vitest";
import { suggestTicker, uniqueTicker, isValidTicker } from "./ticker";

describe("suggestTicker", () => {
  it("uses word initials", () => {
    expect(suggestTicker("123 Brickell Renovation")).toBe("BR");
  });
  it("handles multiple words", () => {
    expect(suggestTicker("South Florida Real Estate")).toBe("SFRE");
  });
  it("falls back to alnum for single-letter words", () => {
    expect(suggestTicker("Oak")).toBe("OAK");
  });
  it("handles vowel-only names via alnum fallback", () => {
    expect(suggestTicker("aio")).toBe("AIO");
  });
  it("returns PRJ for empty input", () => {
    expect(suggestTicker("")).toBe("PRJ");
  });
  it("normalizes accented characters", () => {
    expect(suggestTicker("Café Málaga")).toBe("CM");
  });
});

describe("isValidTicker", () => {
  it("accepts 2-10 uppercase alphanumeric starting with letter", () => {
    expect(isValidTicker("BRKL")).toBe(true);
    expect(isValidTicker("A1")).toBe(true);
    expect(isValidTicker("TESTPROJ10")).toBe(true);
  });
  it("rejects invalid", () => {
    expect(isValidTicker("A")).toBe(false);
    expect(isValidTicker("brkl")).toBe(false);
    expect(isValidTicker("1BRKL")).toBe(false);
    expect(isValidTicker("BR-KL")).toBe(false);
    expect(isValidTicker("TOOLONGTICKER")).toBe(false);
  });
});

describe("uniqueTicker", () => {
  it("returns suggestion when not taken", () => {
    expect(uniqueTicker("BRKL", [])).toBe("BRKL");
  });
  it("appends counter when taken", () => {
    expect(uniqueTicker("BRKL", ["BRKL"])).toBe("BRKL2");
  });
  it("increments through counters", () => {
    expect(uniqueTicker("BRKL", ["BRKL", "BRKL2", "BRKL3"])).toBe("BRKL4");
  });
});
