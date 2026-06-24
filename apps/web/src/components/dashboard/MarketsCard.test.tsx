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
});
