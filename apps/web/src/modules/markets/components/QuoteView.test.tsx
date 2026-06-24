// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Quote } from "@/lib/markets/providers/types";

// getQuote rejects so the re-fetch never overwrites initialQuote; stub the
// heavy tab children (canvas chart / network lists) for jsdom.
vi.mock("../lib/client-api", () => ({
  getQuote: vi.fn().mockRejectedValue(new Error("offline")),
}));
vi.mock("./PriceChart", () => ({ PriceChart: () => <div /> }));
vi.mock("./NewsList", () => ({ NewsList: () => <div /> }));
vi.mock("./FinancialsTable", () => ({ FinancialsTable: () => <div /> }));
vi.mock("./AttributionFooter", () => ({ AttributionFooter: () => <div /> }));

import { QuoteView } from "./QuoteView";

afterEach(cleanup);

function q(): Quote {
  return {
    symbol: "AAPL",
    name: "Apple",
    price: 150,
    change: 1,
    changePct: 0.7,
    open: 149,
    high: 151,
    low: 148,
    prevClose: 149,
    volume: 1_000_000,
    marketCap: 2_000_000_000_000,
    peRatio: 28.5,
    week52High: 200,
    week52Low: 120,
    currency: "USD",
    exchange: "NASDAQ",
    marketState: "open",
    asOf: "2026-06-23T12:00:00Z",
    provider: "finnhub",
  };
}

describe("QuoteView summary", () => {
  it("shows P/E and the 52-week range bar", () => {
    render(<QuoteView symbol="AAPL" initialQuote={q()} profile={null} />);
    expect(screen.getByText("P/E")).toBeTruthy();
    expect(screen.getByText("28.50")).toBeTruthy();
    expect(screen.getByText("52-week range")).toBeTruthy();
    expect(screen.getByText("Day range")).toBeTruthy();
  });
});
