// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import type { Quote } from "@/lib/markets/providers/types";

vi.mock("@/lib/supabase/realtime", () => ({ useRealtimeTable: () => {} }));
vi.mock("@/modules/markets/lib/client-api", () => ({
  listWatchlists: vi.fn(),
  getQuotes: vi.fn(),
  getRatesBoard: vi.fn().mockResolvedValue({ configured: false, board: null }),
  getOverview: vi.fn(),
  getMovers: vi.fn(),
}));

import {
  listWatchlists,
  getQuotes,
  getOverview,
  getMovers,
} from "@/modules/markets/lib/client-api";
import { MarketsCard } from "./MarketsCard";

const mockList = vi.mocked(listWatchlists);
const mockQuotes = vi.mocked(getQuotes);
const mockOverview = vi.mocked(getOverview);
const mockMovers = vi.mocked(getMovers);

function q(symbol: string, price: number, changePct: number): Quote {
  return { symbol, name: `${symbol} Inc`, price, changePct } as unknown as Quote;
}

afterEach(cleanup);

describe("MarketsCard", () => {
  it("renders the built-in Watching list + indices strip even with no DB watchlists", async () => {
    mockList.mockResolvedValue([]);
    mockQuotes.mockResolvedValue({
      AAPL: q("AAPL", 200, 1.5),
      SPY: q("SPY", 500, 0.3),
    });

    render(<MarketsCard />);
    // Built-in Watching symbols render immediately (no DB list required).
    expect(await screen.findByText("AAPL")).toBeTruthy();
    expect(screen.getByText("BTC-USD")).toBeTruthy(); // crypto row present
    expect(screen.getByText("GLD")).toBeTruthy(); // commodity proxy present
    expect(screen.getByText("S&P 500")).toBeTruthy(); // indices pulse strip
    expect(screen.getByText(/CoinGecko/)).toBeTruthy(); // source attribution footer
  });

  it("offers the watchlist picker (Watching + the viewer's lists) when DB lists exist", async () => {
    mockList.mockResolvedValue([
      { id: "w1", name: "My List", symbols: [{ symbol: "TSLA" }] },
    ] as unknown as Awaited<ReturnType<typeof listWatchlists>>);
    mockQuotes.mockResolvedValue({ AAPL: q("AAPL", 200, 1.5) });

    render(<MarketsCard />);
    // Wait for the DB lists to load and the picker to appear.
    const picker = await screen.findByRole("combobox", { name: "Watchlist" });
    const options = Array.from(picker.querySelectorAll("option")).map(
      (o) => o.textContent,
    );
    expect(options).toContain("Watching");
    expect(options).toContain("My List");
  });

  it("switches to the Overview view and renders the macro board inline", async () => {
    mockList.mockResolvedValue([]);
    mockQuotes.mockResolvedValue({});
    mockOverview.mockResolvedValue({
      indices: [
        { symbol: "SPX", label: "S&P 500", price: 5000, change: 10, changePct: 0.2 },
      ],
      sectors: [],
      commodities: [],
      fx: [],
    });

    render(<MarketsCard />);
    expect(await screen.findByText("AAPL")).toBeTruthy(); // default Watchlist view

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(await screen.findByText("Indices")).toBeTruthy(); // group header
    expect(screen.getByText("S&P 500")).toBeTruthy(); // board row
    expect(mockOverview).toHaveBeenCalled();
  });

  it("switches to the Movers view and renders gainers", async () => {
    mockList.mockResolvedValue([]);
    mockQuotes.mockResolvedValue({});
    mockMovers.mockResolvedValue([
      { symbol: "AMD", name: "Advanced Micro", price: 120, change: 5, changePct: 4.3, volume: null },
    ]);

    render(<MarketsCard />);
    expect(await screen.findByText("AAPL")).toBeTruthy(); // default Watchlist view

    fireEvent.click(screen.getByRole("button", { name: "Movers" }));
    expect(await screen.findByText("AMD")).toBeTruthy(); // mover row (not in Watching)
    expect(mockMovers).toHaveBeenCalledWith("gainers");
  });
});
