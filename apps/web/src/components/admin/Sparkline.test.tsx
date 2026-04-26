/// <reference types="vitest" />
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("renders an axis line for empty input", () => {
    const { container } = render(<Sparkline points={[]} />);
    const line = container.querySelector("line");
    expect(line).toBeTruthy();
    expect(container.querySelector("path")).toBeNull();
  });

  it("renders a polyline path for points", () => {
    const { container } = render(<Sparkline points={[1, 2, 3, 2, 5]} />);
    const path = container.querySelector("path");
    expect(path).toBeTruthy();
    expect(path?.getAttribute("d")).toMatch(/^M[\d.]+,[\d.]+( L[\d.]+,[\d.]+)+$/);
  });

  it("respects width / height props on the SVG", () => {
    const { container } = render(
      <Sparkline points={[1, 2]} width={200} height={40} />,
    );
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("200");
    expect(svg?.getAttribute("height")).toBe("40");
  });

  it("handles a single-point series without crashing", () => {
    const { container } = render(<Sparkline points={[42]} />);
    expect(container.querySelector("path")).toBeTruthy();
  });

  it("collapses to axis when all points are equal", () => {
    const { container } = render(<Sparkline points={[5, 5, 5]} />);
    const path = container.querySelector("path");
    expect(path).toBeTruthy();
    // No y-divide-by-zero — coordinates remain finite numbers.
    expect(path?.getAttribute("d")).not.toMatch(/NaN|Infinity/);
  });
});
