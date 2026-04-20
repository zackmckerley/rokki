// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";
import {
  PriorityDots,
  StatusPill,
  DueChip,
  Avatar,
  TickerChip,
} from "./primitives";

// Silence unused import warning — the JSX factory relies on React.
void React;

/**
 * A11y smoke tests for shared primitives. Catches:
 *   - missing aria-label on icon-only buttons
 *   - color-only information
 *   - low-contrast tokens
 *   - semantic tag mistakes (button inside button, etc.)
 *
 * Run with `pnpm test` (these are fast units, not the RLS suite).
 */

describe("primitives — a11y", () => {
  it("PriorityDots has no violations", async () => {
    const { container } = render(<PriorityDots priority={2} />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it("StatusPill renders all canonical statuses", async () => {
    const statuses = ["todo", "in_progress", "blocked", "review", "done"];
    for (const s of statuses) {
      const { container } = render(<StatusPill status={s} />);
      const results = await axe(container);
      expect(results.violations).toEqual([]);
    }
  });

  it("DueChip has no violations at various distances", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date(Date.now() + 5 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const past = new Date(Date.now() - 5 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    for (const d of [today, future, past]) {
      const { container } = render(<DueChip date={d} />);
      const results = await axe(container);
      expect(results.violations).toEqual([]);
    }
  });

  it("Avatar carries an accessible name", async () => {
    const { container, getByLabelText } = render(
      <Avatar name="Zack McKerley" size="md" />,
    );
    expect(getByLabelText("Zack McKerley")).toBeDefined();
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });

  it("TickerChip has no violations", async () => {
    const { container } = render(<TickerChip>BRKL</TickerChip>);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
