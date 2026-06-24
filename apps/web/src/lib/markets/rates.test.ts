import { describe, it, expect, afterEach, vi } from "vitest";

// rates.ts is server-only; stub the marker so it imports under vitest.
vi.mock("server-only", () => ({}));

import {
  getRatesBoard,
  ratesAvailable,
  __resetRatesCache,
} from "./rates";

afterEach(() => {
  vi.unstubAllGlobals();
  __resetRatesCache();
  delete process.env.FRED_API_KEY;
});

function obsRes(latest: string, prev: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        observations: [
          { date: "2026-06-23", value: latest },
          { date: "2026-06-20", value: prev },
        ],
      }),
  } as Response;
}

describe("ratesAvailable", () => {
  it("reflects FRED_API_KEY", () => {
    delete process.env.FRED_API_KEY;
    expect(ratesAvailable()).toBe(false);
    process.env.FRED_API_KEY = "k";
    expect(ratesAvailable()).toBe(true);
  });
});

describe("getRatesBoard", () => {
  it("throws when no key is configured", async () => {
    delete process.env.FRED_API_KEY;
    await expect(getRatesBoard()).rejects.toThrow(/not configured/);
  });

  it("maps FRED observations into Treasury + reference rows with day change", async () => {
    process.env.FRED_API_KEY = "k";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => obsRes("4.32", "4.30")),
    );
    const board = await getRatesBoard();
    expect(board.treasury.length).toBeGreaterThan(0);
    expect(board.reference.length).toBe(3); // SOFR, Prime, Fed Funds
    const threeM = board.treasury.find((r) => r.label === "3M")!;
    expect(threeM.value).toBe(4.32);
    expect(threeM.change).toBeCloseTo(0.02, 3);
    expect(threeM.asOf).toBe("2026-06-23");
    const sofr = board.reference.find((r) => r.id === "SOFR");
    expect(sofr?.label).toBe("SOFR");
  });

  it("treats '.' as a missing value (null), not a number", async () => {
    process.env.FRED_API_KEY = "k";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => obsRes(".", ".")),
    );
    const board = await getRatesBoard();
    const anyRow = board.treasury[0];
    expect(anyRow.value).toBeNull();
    expect(anyRow.change).toBeNull();
  });

  it("caches the board (second call makes no new fetches)", async () => {
    process.env.FRED_API_KEY = "k";
    const fetchMock = vi.fn(async () => obsRes("5.00", "5.00"));
    vi.stubGlobal("fetch", fetchMock);
    await getRatesBoard();
    const callsAfterFirst = fetchMock.mock.calls.length;
    await getRatesBoard();
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // served from cache
  });
});
