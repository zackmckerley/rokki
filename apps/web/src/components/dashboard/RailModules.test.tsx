// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ModuleVisibilityProvider } from "./module-visibility";
import { RailModules } from "./RailModules";

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
});

describe("RailModules", () => {
  it("renders nothing outside a ModuleVisibility provider", () => {
    const { container } = render(<RailModules />);
    expect(container.firstChild).toBeNull();
  });

  it("lists the three modules, all open by default", () => {
    render(
      <ModuleVisibilityProvider>
        <RailModules />
      </ModuleVisibilityProvider>,
    );
    for (const name of ["Schedule", "Tasks", "Messages"]) {
      const btn = screen.getByText(name).closest("button")!;
      expect(btn.getAttribute("aria-pressed")).toBe("true"); // open
    }
  });

  it("clicking a module toggles it minimized and persists", () => {
    render(
      <ModuleVisibilityProvider>
        <RailModules />
      </ModuleVisibilityProvider>,
    );
    const tasks = screen.getByText("Tasks").closest("button")!;
    expect(tasks.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(tasks);
    expect(tasks.getAttribute("aria-pressed")).toBe("false"); // minimized

    const raw = window.localStorage.getItem("rokki:dash-minimized-modules");
    expect(raw ? JSON.parse(raw) : []).toContain("tasks");

    fireEvent.click(tasks); // back open
    expect(tasks.getAttribute("aria-pressed")).toBe("true");
  });
});
