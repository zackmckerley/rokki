import { describe, it, expect } from "vitest";
import { dealTicker } from "./promote";

const TICKER = /^[A-Z][A-Z0-9]{1,9}$/;

describe("dealTicker", () => {
  it("produces a valid letter-led ticker for a numeric address name", () => {
    // The original suggestTicker could return a digit-leading string here,
    // which violates the terminals ticker CHECK and 400s on promote.
    expect(dealTicker("2510 SW 16 St", [])).toMatch(TICKER);
  });

  it("a purely numeric name still yields a valid ticker", () => {
    expect(dealTicker("42", [])).toMatch(TICKER);
    expect(dealTicker("777", [])).toMatch(TICKER);
  });

  it("an alphabetic name yields a valid ticker", () => {
    expect(dealTicker("Helios Tower", [])).toMatch(TICKER);
  });

  it("dedupes against taken tickers, staying valid", () => {
    const first = dealTicker("Helios Tower", []);
    const second = dealTicker("Helios Tower", [first]);
    expect(second).not.toBe(first);
    expect(second).toMatch(TICKER);
  });
});
