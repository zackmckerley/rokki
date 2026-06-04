// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DashboardPanels } from "./DashboardPanels";
import { usePanelHandle } from "./panel-handle";

beforeAll(() => {
  // jsdom has no matchMedia; the component subscribes to the lg breakpoint.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

function HandleProbe() {
  const handle = usePanelHandle();
  return <div data-testid="probe">{handle ? "has-handle" : "no-handle"}</div>;
}

describe("DashboardPanels", () => {
  it("renders every panel plus the briefing", () => {
    render(
      <DashboardPanels
        briefing={<div>BRIEFING</div>}
        week={<div>WEEK_PANEL</div>}
        tasks={<div>TASKS_PANEL</div>}
        messages={<div>MESSAGES_PANEL</div>}
      />,
    );
    expect(screen.getByText("BRIEFING")).toBeTruthy();
    expect(screen.getByText("WEEK_PANEL")).toBeTruthy();
    expect(screen.getByText("TASKS_PANEL")).toBeTruthy();
    expect(screen.getByText("MESSAGES_PANEL")).toBeTruthy();
  });

  it("supplies a drag handle to a hosted card via context", () => {
    render(
      <DashboardPanels
        briefing={null}
        week={<HandleProbe />}
        tasks={<div>t</div>}
        messages={<div>m</div>}
      />,
    );
    expect(screen.getByTestId("probe").textContent).toBe("has-handle");
  });

  it("restores a saved arrangement from localStorage (panels still all present)", () => {
    window.localStorage.setItem(
      "rokki:dash-panels",
      JSON.stringify({
        layout: { center: ["messages"], right: ["week", "tasks"] },
        weights: { week: 2, tasks: 1, messages: 1 },
        centerFrac: 0.5,
      }),
    );
    render(
      <DashboardPanels
        briefing={null}
        week={<div>WEEK_PANEL</div>}
        tasks={<div>TASKS_PANEL</div>}
        messages={<div>MESSAGES_PANEL</div>}
      />,
    );
    // Whatever the saved arrangement, no panel is ever lost.
    expect(screen.getByText("WEEK_PANEL")).toBeTruthy();
    expect(screen.getByText("TASKS_PANEL")).toBeTruthy();
    expect(screen.getByText("MESSAGES_PANEL")).toBeTruthy();
  });
});
