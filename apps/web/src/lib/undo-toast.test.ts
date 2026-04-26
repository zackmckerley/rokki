// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { announceUndo } from "./undo-toast";

describe("announceUndo", () => {
  beforeEach(() => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    delete (window as unknown as { __rokkiToast?: unknown }).__rokkiToast;
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to console.info when no Toaster is registered", () => {
    announceUndo({ from: "a", to: "b", agoSeconds: 3 });
    expect(console.info).toHaveBeenCalledTimes(1);
    const arg = (console.info as unknown as { mock: { calls: string[][] } })
      .mock.calls[0]![0];
    expect(arg).toContain("Reverted to 3 seconds ago");
  });

  it("renders sub-second deltas as 'a moment ago'", () => {
    announceUndo({ from: "x", to: "y", agoSeconds: 0 });
    const arg = (console.info as unknown as { mock: { calls: string[][] } })
      .mock.calls[0]![0];
    expect(arg).toContain("a moment ago");
  });

  it("groups singular vs plural correctly", () => {
    announceUndo({ from: "a", to: "b", agoSeconds: 1 });
    expect(
      (console.info as unknown as { mock: { calls: string[][] } }).mock.calls[0]![0],
    ).toContain("1 second ago");
    announceUndo({ from: "a", to: "b", agoSeconds: 90 });
    expect(
      (console.info as unknown as { mock: { calls: string[][] } }).mock.calls[1]![0],
    ).toContain("2 minutes ago");
    announceUndo({ from: "a", to: "b", agoSeconds: 7200 });
    expect(
      (console.info as unknown as { mock: { calls: string[][] } }).mock.calls[2]![0],
    ).toContain("2 hours ago");
  });

  it("prefers a registered global toaster if present", () => {
    const spy = vi.fn();
    (window as unknown as { __rokkiToast: typeof spy }).__rokkiToast = spy;
    announceUndo({ from: "a", to: "b", agoSeconds: 5, context: "comment" });
    expect(spy).toHaveBeenCalledWith(
      "info",
      expect.stringContaining("Reverted to 5 seconds ago"),
    );
    expect(console.info).not.toHaveBeenCalled();
  });
});
