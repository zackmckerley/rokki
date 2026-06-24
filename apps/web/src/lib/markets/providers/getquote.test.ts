import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Quote } from "./types";

// All provider modules are server-only; stub the marker so index imports.
vi.mock("server-only", () => ({}));

// Hoisted mock fns so the vi.mock factories (hoisted above imports) can use them.
const { fhQuote, tdQuote, cgQuote } = vi.hoisted(() => ({
  fhQuote: vi.fn(),
  tdQuote: vi.fn(),
  cgQuote: vi.fn(),
}));

vi.mock("./finnhub", () => ({
  finnhub: { id: "finnhub", attribution: "", quote: fhQuote },
  finnhubAvailable: () => true,
}));
vi.mock("./twelvedata", () => ({
  twelvedata: { id: "twelvedata", attribution: "", quote: tdQuote },
  twelvedataAvailable: () => true,
}));
vi.mock("./fmp", () => ({
  fmp: { id: "fmp", attribution: "" },
  fmpAvailable: () => false,
}));
vi.mock("./coingecko", () => ({
  coingecko: { id: "coingecko", attribution: "", quote: cgQuote },
  coingeckoAvailable: () => true,
  // Real-ish gate: crypto symbols only.
  isCryptoSymbol: (s: string) => s.includes("BTC") || s.includes("ETH"),
}));

import { getQuote } from "./index";

const q = (provider: string) =>
  ({ symbol: "X", price: 1, provider }) as unknown as Quote;

beforeEach(() => {
  fhQuote.mockReset();
  tdQuote.mockReset();
  cgQuote.mockReset();
});

describe("getQuote provider routing", () => {
  it("routes a crypto symbol to CoinGecko first and never touches the equity feeds", async () => {
    cgQuote.mockResolvedValue(q("coingecko"));
    const out = await getQuote("BTC-USD");
    expect(out.provider).toBe("coingecko");
    expect(cgQuote).toHaveBeenCalledTimes(1);
    expect(fhQuote).not.toHaveBeenCalled();
    expect(tdQuote).not.toHaveBeenCalled();
  });

  it("routes an equity symbol to Finnhub and never touches CoinGecko", async () => {
    fhQuote.mockResolvedValue(q("finnhub"));
    const out = await getQuote("AAPL");
    expect(out.provider).toBe("finnhub");
    expect(cgQuote).not.toHaveBeenCalled();
  });

  it("falls through to the next provider when CoinGecko fails for a crypto symbol", async () => {
    cgQuote.mockRejectedValue(new Error("coingecko down"));
    fhQuote.mockResolvedValue(q("finnhub"));
    const out = await getQuote("ETH-USD");
    expect(cgQuote).toHaveBeenCalled();
    expect(fhQuote).toHaveBeenCalled();
    expect(out.provider).toBe("finnhub");
  });
});
