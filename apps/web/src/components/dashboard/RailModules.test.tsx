// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ModuleVisibilityProvider } from "./module-visibility";
import { RailModules } from "./RailModules";
import {
  MODULE_PREFS_STORAGE_KEY,
  defaultModulePrefs,
  type ModulePrefs,
} from "@/lib/module-prefs";

function seed(over: Partial<ModulePrefs>) {
  window.localStorage.setItem(
    MODULE_PREFS_STORAGE_KEY,
    JSON.stringify({ ...defaultModulePrefs(), ...over }),
  );
}

function readPrefs(): ModulePrefs {
  return JSON.parse(window.localStorage.getItem(MODULE_PREFS_STORAGE_KEY)!);
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
});

describe("RailModules", () => {
  it("renders nothing outside a ModulePrefs provider", () => {
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

  it("renders modules in the stored order", () => {
    seed({ order: ["messages", "tasks", "week"] });
    render(
      <ModuleVisibilityProvider>
        <RailModules />
      </ModuleVisibilityProvider>,
    );
    const labels = screen.getAllByRole("button").map((b) => b.textContent);
    expect(labels).toEqual(["Messages", "Tasks", "Schedule", "Markets", "Goals"]);
  });

  it("does not render hidden modules", () => {
    seed({ hidden: ["tasks"] });
    render(
      <ModuleVisibilityProvider>
        <RailModules />
      </ModuleVisibilityProvider>,
    );
    expect(screen.queryByText("Tasks")).toBeNull();
    expect(screen.getByText("Schedule")).toBeTruthy();
    expect(screen.getByText("Messages")).toBeTruthy();
  });

  it("shows minimized modules as not-pressed (un-barred)", () => {
    seed({ minimized: ["tasks"] });
    render(
      <ModuleVisibilityProvider>
        <RailModules />
      </ModuleVisibilityProvider>,
    );
    expect(
      screen.getByText("Tasks").closest("button")!.getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen.getByText("Schedule").closest("button")!.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("renders the all-hidden hint when every module is hidden", () => {
    seed({ hidden: ["week", "tasks", "messages", "markets", "goals"] });
    render(
      <ModuleVisibilityProvider>
        <RailModules />
      </ModuleVisibilityProvider>,
    );
    expect(screen.getByText(/All modules hidden/i)).toBeTruthy();
  });

  it("clicking a module toggles it minimized and persists to module prefs", () => {
    render(
      <ModuleVisibilityProvider>
        <RailModules />
      </ModuleVisibilityProvider>,
    );
    const tasks = screen.getByText("Tasks").closest("button")!;
    expect(tasks.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(tasks);
    expect(tasks.getAttribute("aria-pressed")).toBe("false"); // minimized
    expect(readPrefs().minimized).toContain("tasks");

    fireEvent.click(tasks); // back open
    expect(tasks.getAttribute("aria-pressed")).toBe("true");
    expect(readPrefs().minimized).not.toContain("tasks");
  });

  it("migrates legacy minimized storage on first load", () => {
    window.localStorage.setItem(
      "rokki:dash-minimized-modules",
      JSON.stringify(["messages"]),
    );
    render(
      <ModuleVisibilityProvider>
        <RailModules />
      </ModuleVisibilityProvider>,
    );
    expect(
      screen.getByText("Messages").closest("button")!.getAttribute("aria-pressed"),
    ).toBe("false");
  });
});
