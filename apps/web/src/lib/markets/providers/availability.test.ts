import { describe, it, expect, beforeEach, vi } from "vitest";

// The facade is server-only; stub the marker so the module imports under vitest.
vi.mock("server-only", () => ({}));

import { providerAvailability, dataClassAvailability } from "./index";

const KEYS = ["FINNHUB_API_KEY", "TWELVEDATA_API_KEY", "FMP_API_KEY"];

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("providerAvailability", () => {
  it("reflects which API keys are set (booleans only)", () => {
    expect(providerAvailability()).toEqual({
      finnhub: false,
      twelvedata: false,
      fmp: false,
    });
    process.env.FINNHUB_API_KEY = "k";
    process.env.FMP_API_KEY = "k";
    expect(providerAvailability()).toEqual({
      finnhub: true,
      twelvedata: false,
      fmp: true,
    });
  });
});

describe("dataClassAvailability", () => {
  it("maps each feature to the providers that can serve it", () => {
    process.env.FINNHUB_API_KEY = "k";
    const c = dataClassAvailability();
    // Finnhub-served classes light up; twelvedata/fmp-only classes don't.
    expect(c.quote).toBe(true); // finnhub OR twelvedata
    expect(c.profile).toBe(true); // finnhub only
    expect(c.news).toBe(true); // finnhub only
    expect(c.candles).toBe(false); // twelvedata only
    expect(c.fx).toBe(false); // twelvedata only
    expect(c.financials).toBe(false); // fmp only
    expect(c.movers).toBe(false); // fmp only
  });

  it("twelvedata unlocks charts + fx, fmp unlocks fundamentals + movers", () => {
    process.env.TWELVEDATA_API_KEY = "k";
    process.env.FMP_API_KEY = "k";
    const c = dataClassAvailability();
    expect(c.candles).toBe(true);
    expect(c.fx).toBe(true);
    expect(c.financials).toBe(true);
    expect(c.movers).toBe(true);
    expect(c.news).toBe(false); // still finnhub-only
  });
});
