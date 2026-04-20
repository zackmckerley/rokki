// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { axe } from "vitest-axe";
import { ShortcutsOverlay, KeyHint } from "./ShortcutsOverlay";

// Silence unused import warning — the JSX factory relies on React.
void React;

describe("ShortcutsOverlay", () => {
  beforeEach(() => {
    // Fresh DOM between tests so the window listener doesn't leak.
    document.body.innerHTML = "";
  });
  afterEach(() => {
    cleanup();
  });

  it("stays hidden until `?` is pressed", () => {
    render(<ShortcutsOverlay />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens when `?` is pressed outside an input", () => {
    render(<ShortcutsOverlay />);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("opens on Shift+/ (the localized form of `?`)", () => {
    render(<ShortcutsOverlay />);
    fireEvent.keyDown(window, { key: "/", shiftKey: true });
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("closes when Esc is pressed", () => {
    render(<ShortcutsOverlay />);
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.queryByRole("dialog")).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores `?` inside text inputs so users can type it", () => {
    const { container } = render(
      <>
        <input aria-label="test" />
        <ShortcutsOverlay />
      </>,
    );
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.keyDown(input, { key: "?" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("has no a11y violations when open", async () => {
    const { container } = render(<ShortcutsOverlay />);
    fireEvent.keyDown(window, { key: "?" });
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});

describe("KeyHint", () => {
  afterEach(() => cleanup());

  it("renders each space-separated token as a separate kbd", () => {
    const { container } = render(<KeyHint keys="⌘⇧P" />);
    const kbds = container.querySelectorAll("kbd");
    expect(kbds.length).toBe(1);
    expect(kbds[0].textContent).toBe("⌘⇧P");
  });

  it("renders `then` as a low-emphasis separator, not a kbd", () => {
    const { container } = render(<KeyHint keys="G then D" />);
    const kbds = container.querySelectorAll("kbd");
    expect(kbds.length).toBe(2);
    expect(kbds[0].textContent).toBe("G");
    expect(kbds[1].textContent).toBe("D");
  });
});
