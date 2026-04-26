// @vitest-environment jsdom
import React, { useState } from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, fireEvent, screen, cleanup, act } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Dialog } from "./Dialog";

void React;

describe("Dialog", () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  function Harness({ start = false }: { start?: boolean }) {
    const [open, setOpen] = useState(start);
    return (
      <>
        <button data-testid="trigger" onClick={() => setOpen(true)}>
          Open
        </button>
        <Dialog open={open} onClose={() => setOpen(false)} title="Test dialog">
          <button data-testid="inside-1">first</button>
          <button data-testid="inside-2">second</button>
        </Dialog>
      </>
    );
  }

  it("renders nothing when closed", () => {
    render(<Harness />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("labels itself with the title via aria-labelledby", () => {
    render(<Harness start />);
    const dialog = screen.getByRole("dialog");
    const titleId = dialog.getAttribute("aria-labelledby");
    expect(titleId).toBeTruthy();
    expect(document.getElementById(titleId!)?.textContent).toBe("Test dialog");
  });

  it("moves focus into the panel on open", () => {
    vi.useFakeTimers();
    render(<Harness />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(trigger);
    act(() => {
      vi.runAllTimers();
    });
    expect(document.activeElement).toBe(screen.getByTestId("inside-1"));
  });

  it("returns focus to the trigger on close", () => {
    vi.useFakeTimers();
    render(<Harness />);
    const trigger = screen.getByTestId("trigger");
    trigger.focus();
    fireEvent.click(trigger);
    act(() => {
      vi.runAllTimers();
    });
    fireEvent.keyDown(window, { key: "Escape" });
    act(() => {
      vi.runAllTimers();
    });
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape", () => {
    render(<Harness start />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("traps Tab — wraps from last focusable to first", () => {
    render(<Harness start />);
    // DOM order in the panel: Close (header), inside-1, inside-2.
    // Focus the last and press Tab — should wrap back to Close.
    const last = screen.getByTestId("inside-2");
    last.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Close" }),
    );
  });

  it("traps Shift+Tab — wraps from first focusable to last", () => {
    render(<Harness start />);
    const close = screen.getByRole("button", { name: "Close" });
    close.focus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByTestId("inside-2"));
  });

  it("has no a11y violations", async () => {
    const { container } = render(<Harness start />);
    const results = await axe(container);
    expect(results.violations).toEqual([]);
  });
});
