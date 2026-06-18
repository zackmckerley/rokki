// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { OnlineContext, useIsOnline } from "./PresenceProvider";
import { PresenceDot, PresenceLabel } from "./PresenceDot";

afterEach(() => cleanup());

function withOnline(ids: string[], ui: React.ReactNode) {
  return (
    <OnlineContext.Provider value={new Set(ids)}>{ui}</OnlineContext.Provider>
  );
}

describe("PresenceDot / PresenceLabel", () => {
  it("renders an online dot for a user who has Rokki open", () => {
    render(withOnline(["u1"], <PresenceDot userId="u1" />));
    expect(screen.getByLabelText("online")).toBeTruthy();
  });

  it("renders an offline dot for a user who is not present", () => {
    render(withOnline(["u1"], <PresenceDot userId="u2" />));
    expect(screen.getByLabelText("offline")).toBeTruthy();
  });

  it("labels online/offline text accordingly", () => {
    const { rerender } = render(
      withOnline(["u1"], <PresenceLabel userId="u1" />),
    );
    expect(screen.getByText("online")).toBeTruthy();
    rerender(withOnline(["u1"], <PresenceLabel userId="u2" />));
    expect(screen.getByText("offline")).toBeTruthy();
  });

  it("treats null/undefined userId and no-provider as offline", () => {
    render(<PresenceDot userId={null} />); // no provider at all
    expect(screen.getByLabelText("offline")).toBeTruthy();
  });
});

describe("useIsOnline", () => {
  function Probe({ id }: { id?: string | null }) {
    return <span>{useIsOnline(id) ? "yes" : "no"}</span>;
  }
  it("reflects membership in the online set", () => {
    render(withOnline(["a", "b"], <Probe id="b" />));
    expect(screen.getByText("yes")).toBeTruthy();
  });
  it("is false for unknown / nullish ids", () => {
    render(withOnline(["a"], <Probe id="z" />));
    expect(screen.getByText("no")).toBeTruthy();
  });
});
