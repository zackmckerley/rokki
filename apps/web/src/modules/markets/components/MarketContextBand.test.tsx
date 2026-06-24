// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

vi.mock("../lib/client-api", () => ({
  getOverview: vi.fn(),
  getRatesBoard: vi.fn(),
}));

import { getOverview, getRatesBoard } from "../lib/client-api";
import { MarketContextBand } from "./MarketContextBand";

const mockOverview = vi.mocked(getOverview);
const mockRates = vi.mocked(getRatesBoard);

afterEach(cleanup);

describe("MarketContextBand", () => {
  it("renders indices + benchmark rates", async () => {
    mockOverview.mockResolvedValue({
      indices: [
        { symbol: "SPX", label: "S&P 500", price: 5000, change: 5, changePct: 0.2 },
      ],
      sectors: [],
      commodities: [],
      fx: [],
    });
    mockRates.mockResolvedValue({
      configured: true,
      board: {
        treasury: [
          { id: "DGS3MO", label: "3M", value: 4.3, change: 0.01, asOf: "2026-06-23" },
        ],
        reference: [],
      },
    });

    render(<MarketContextBand />);
    expect(await screen.findByText("S&P 500")).toBeTruthy();
    expect(await screen.findByText("3M")).toBeTruthy();
  });

  it("renders nothing when both feeds are empty / unconfigured", async () => {
    mockOverview.mockResolvedValue({ indices: [], sectors: [], commodities: [], fx: [] });
    mockRates.mockResolvedValue({ configured: false, board: null });

    const { container } = render(<MarketContextBand />);
    await waitFor(() => expect(container.firstChild).toBeNull());
  });
});
