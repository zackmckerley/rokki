// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DashboardPanels } from "./DashboardPanels";
import {
  usePanelHandle,
  usePanelMaximize,
  usePanelMinimize,
} from "./panel-handle";
import { ModuleVisibilityProvider } from "./module-visibility";

function setDesktop(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

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
  setDesktop(false);
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

  it("maximize fills the area and hides the other panels; restore brings them back", () => {
    setDesktop(true);
    function WeekProbe() {
      return <div>WEEK{usePanelMaximize()}</div>;
    }
    render(
      <DashboardPanels
        briefing={null}
        week={<WeekProbe />}
        tasks={<div>t</div>}
        messages={<div>m</div>}
      />,
    );
    const tasksPanel = () =>
      document.querySelector('[data-panel-id="tasks"]') as HTMLElement;

    // Maximize Week → the other panels are hidden on desktop.
    fireEvent.click(screen.getByLabelText("Maximize Week"));
    expect(tasksPanel().className).toContain("lg:hidden");
    // Button flips to Restore.
    const restore = screen.getByLabelText("Restore Week");
    expect(restore).toBeTruthy();

    // Restore → the others come back.
    fireEvent.click(restore);
    expect(tasksPanel().className).not.toContain("lg:hidden");
    expect(screen.getByLabelText("Maximize Week")).toBeTruthy();
  });

  it("minimize removes a panel from the viewing area (with provider)", () => {
    setDesktop(true);
    function WeekProbe() {
      return <div>WEEK{usePanelMinimize()}</div>;
    }
    render(
      <ModuleVisibilityProvider>
        <DashboardPanels
          briefing={null}
          week={<WeekProbe />}
          tasks={<div>TASKS_PANEL</div>}
          messages={<div>m</div>}
        />
      </ModuleVisibilityProvider>,
    );
    // Week is in the viewing area initially.
    expect(document.querySelector('[data-panel-id="week"]')).not.toBeNull();
    // Minimize it → it leaves the viewing area.
    fireEvent.click(screen.getByLabelText("Minimize Week"));
    expect(document.querySelector('[data-panel-id="week"]')).toBeNull();
    // Tasks is still there.
    expect(document.querySelector('[data-panel-id="tasks"]')).not.toBeNull();
  });
});
