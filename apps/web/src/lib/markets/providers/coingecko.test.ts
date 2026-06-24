import { describe, it, expect, afterEach, vi } from "vitest";

// coingecko.ts is server-only; stub the marker so it imports under vitest.
vi.mock("server-only", () => ({}));

import { coingecko, coingeckoAvailable, cryptoBase, isCryptoSymbol } from "./coingecko";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonRes(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("cryptoBase / isCryptoSymbol", () => {
  it("recognizes the common symbol shapes", () => {
    expect(cryptoBase("BTC")).toBe("BTC");
    expect(cryptoBase("BTC-USD")).toBe("BTC");
    expect(cryptoBase("btc/usd")).toBe("BTC");
    expect(cryptoBase("ETHUSD")).toBe("ETH");
    expect(cryptoBase("SOL-USD")).toBe("SOL");
    expect(cryptoBase("XRP-USD")).toBe("XRP");
  });

  it("returns null for equities/ETFs/unknowns", () => {
    expect(cryptoBase("AAPL")).toBeNull();
    expect(cryptoBase("GLD")).toBeNull();
    expect(cryptoBase("USO")).toBeNull();
    expect(isCryptoSymbol("AAPL")).toBe(false);
    expect(isCryptoSymbol("BTC-USD")).toBe(true);
  });

  it("is always available (no key required)", () => {
    expect(coingeckoAvailable()).toBe(true);
  });
});

describe("coingecko.quote", () => {
  it("maps simple/price into a normalized Quote and echoes the canonical symbol", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonRes({
          bitcoin: {
            usd: 101000,
            usd_24h_change: 2, // +2% over 24h
            usd_24h_vol: 35_000_000_000,
            usd_market_cap: 2_000_000_000_000,
            last_updated_at: 1_700_000_000,
          },
        }),
      ),
    );
    const q = await coingecko.quote!("BTC-USD");
    expect(q.symbol).toBe("BTC-USD"); // canonical echoed, not "bitcoin"
    expect(q.name).toBe("Bitcoin");
    expect(q.price).toBe(101000);
    expect(q.changePct).toBe(2);
    expect(q.currency).toBe("USD");
    expect(q.marketState).toBe("open");
    expect(q.provider).toBe("coingecko");
    // prevClose derived from the 24h move: 101000 / 1.02
    expect(q.prevClose).toBeCloseTo(101000 / 1.02, 2);
    expect(q.change).toBeCloseTo(101000 - 101000 / 1.02, 2);
    expect(q.volume).toBe(35_000_000_000);
    expect(q.marketCap).toBe(2_000_000_000_000);
  });

  it("throws 404 for an unknown crypto symbol (no network call)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(coingecko.quote!("AAPL")).rejects.toThrow(/Unknown crypto/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws when the coin is missing from the response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonRes({})));
    await expect(coingecko.quote!("ETH-USD")).rejects.toThrow(/No quote/);
  });
});
