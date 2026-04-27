// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { useLeaderKey, type LeaderRoute } from "./use-leader-key";

void React;

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

function Probe({
  routes,
  timeoutMs,
}: {
  routes: LeaderRoute[];
  timeoutMs?: number;
}) {
  useLeaderKey({ routes, timeoutMs });
  return null;
}

describe("useLeaderKey", () => {
  beforeEach(() => {
    pushMock.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  const routes: LeaderRoute[] = [
    { key: "d", path: "/", label: "Dashboard" },
    { key: "t", path: "/tools", label: "Tools" },
  ];

  it("routes after the leader + matching follow-up key", () => {
    render(<Probe routes={routes} />);
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "d" });
    expect(pushMock).toHaveBeenCalledWith("/");
  });

  it("is case-insensitive on the follow-up", () => {
    render(<Probe routes={routes} />);
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "T" });
    expect(pushMock).toHaveBeenCalledWith("/tools");
  });

  it("disarms after the timeout if the follow-up never arrives", () => {
    render(<Probe routes={routes} timeoutMs={500} />);
    fireEvent.keyDown(window, { key: "g" });
    vi.advanceTimersByTime(600);
    fireEvent.keyDown(window, { key: "d" });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("ignores the leader inside text inputs", () => {
    const { container } = render(
      <>
        <input aria-label="t" />
        <Probe routes={routes} />
      </>,
    );
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.keyDown(input, { key: "g" });
    fireEvent.keyDown(input, { key: "d" });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("does not trigger on ⌘G (browser find)", () => {
    render(<Probe routes={routes} />);
    fireEvent.keyDown(window, { key: "g", metaKey: true });
    fireEvent.keyDown(window, { key: "d" });
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("an unmapped follow-up cancels the chord without navigation", () => {
    render(<Probe routes={routes} />);
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "x" });
    expect(pushMock).not.toHaveBeenCalled();
    // Subsequent G then D still works.
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "d" });
    expect(pushMock).toHaveBeenCalledWith("/");
  });
});
