// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRefreshOnFocus } from "./use-refresh-on-focus";

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
}

describe("useRefreshOnFocus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setVisibility("visible");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes when the window regains focus (after debounce)", () => {
    const onRefresh = vi.fn();
    renderHook(() => useRefreshOnFocus(onRefresh));
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    // Debounced — nothing yet.
    expect(onRefresh).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("coalesces a focus + visibilitychange burst into one refresh", () => {
    const onRefresh = vi.fn();
    renderHook(() => useRefreshOnFocus(onRefresh));
    act(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh while the document is hidden", () => {
    const onRefresh = vi.fn();
    renderHook(() => useRefreshOnFocus(onRefresh));
    setVisibility("hidden");
    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(200);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("refreshes when the browser reconnects (online)", () => {
    const onRefresh = vi.fn();
    renderHook(() => useRefreshOnFocus(onRefresh));
    act(() => {
      window.dispatchEvent(new Event("online"));
      vi.advanceTimersByTime(160);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it("throttles rapid focus events to the min interval", () => {
    const onRefresh = vi.fn();
    renderHook(() => useRefreshOnFocus(onRefresh, { minIntervalMs: 5000 }));
    // First focus → fires.
    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(160);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    // Second focus 1s later → within the floor, suppressed.
    act(() => {
      vi.advanceTimersByTime(1000);
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(160);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    // Third focus well past the floor → fires again.
    act(() => {
      vi.advanceTimersByTime(6000);
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(160);
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it("removes its listeners on unmount", () => {
    const onRefresh = vi.fn();
    const { unmount } = renderHook(() => useRefreshOnFocus(onRefresh));
    unmount();
    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(200);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
