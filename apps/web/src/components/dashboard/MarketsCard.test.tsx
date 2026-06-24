// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Quote } from "@/lib/markets/providers/types";

vi.mock("@/lib/supabase/realtime", () => ({ useRealtimeTable: () => {} }));
vi.mock("@/modules/markets/lib/client-api", () => ({
  listWatchlists: vi.fn(),
  getQuotes: vi.fn(),
}));

import { listWatchlists, getQuotes } from "@/modules/markets/lib/client-api";
import { MarketsCard } from "./MarketsCard";

const mockList = vi.mocked(listWatchlists);
const mockQuotes = vi.mocked(getQuotes);

function q(symbol: string, price: number, changePct: number): Quote {
  return { symbol, name: `${symbol} Inc`, price, changePct } as unknown as Quote;
}

afterEach(cleanup);

describe("MarketsCard", () => {
  it("renders the active watchlist with live quotes + the indices strip", async () => {
    mockList.mockResolvedValue([
      {
        id: "w1",
        name: "Watching",
        symbols: [{ symbol: "AAPL" }, { symbol: "MSFT" }],
      },
    ] as unknown as Awaited<ReturnType<typeof listWatchlists>>);
    mockQuotes.mockResolvedValue({
      AAPL: q("AAPL", 200, 1.5),
      MSFT: q("MSFT", 400, -0.8),
      SPY: q("SPY", 500, 0.3),
    });

    render(<MarketsCard />);
    expect(await screen.findByText("AAPL")).toBeTruthy();
    expect(screen.getByText("MSFT")).toBeTruthy();
    expect(screen.getByText("S&P 500")).toBeTruthy(); // indices pulse strip
  });

  it("shows an empty state when there are no watchlists", async () => {
    mockList.mockResolvedValue([]);
    mockQuotes.mockResolvedValue({});
    render(<MarketsCard />);
    expect(await screen.findByText("No watchlists yet.")).toBeTruthy();
  });
});
