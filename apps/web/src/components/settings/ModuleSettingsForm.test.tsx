// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { ModuleVisibilityProvider } from "../dashboard/module-visibility";
import { ModuleSettingsForm } from "./ModuleSettingsForm";
import {
  MODULE_PREFS_STORAGE_KEY,
  defaultModulePrefs,
  type ModulePrefs,
} from "@/lib/module-prefs";

function readPrefs(): ModulePrefs {
  return JSON.parse(window.localStorage.getItem(MODULE_PREFS_STORAGE_KEY)!);
}

function renderForm() {
  return render(
    <ModuleVisibilityProvider>
      <ModuleSettingsForm />
    </ModuleVisibilityProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
});

describe("ModuleSettingsForm", () => {
  it("renders nothing outside a provider", () => {
    const { container } = render(<ModuleSettingsForm />);
    expect(container.firstChild).toBeNull();
  });

  it("lists the three modules", () => {
    renderForm();
    expect(screen.getByText("Schedule")).toBeTruthy();
    expect(screen.getByText("Tasks")).toBeTruthy();
    expect(screen.getByText("Messages")).toBeTruthy();
  });

  it("shows the section cards", () => {
    renderForm();
    expect(screen.getByText("Modules")).toBeTruthy();
    expect(screen.getByText("Layout")).toBeTruthy();
    expect(screen.getByText("Behavior")).toBeTruthy();
  });

  describe("reorder", () => {
    it("moves a module up and persists", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: "Move Tasks up" }));
      expect(readPrefs().order).toEqual([
        "tasks",
        "week",
        "messages",
        "markets",
        "goals",
        "contacts",
        "pipeline",
      ]);
    });
    it("moves a module down and persists", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: "Move Schedule down" }));
      expect(readPrefs().order).toEqual([
        "tasks",
        "week",
        "messages",
        "markets",
        "goals",
        "contacts",
        "pipeline",
      ]);
    });
    it("disables Move up on the first module", () => {
      renderForm();
      expect(
        (screen.getByRole("button", { name: "Move Schedule up" }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });
    it("disables Move down on the last module", () => {
      renderForm();
      expect(
        (screen.getByRole("button", { name: "Move Pipeline down" }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });
  });

  describe("show / hide", () => {
    it("hiding persists and moves to the Hidden tray", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: "Hide Tasks" }));
      expect(readPrefs().hidden).toEqual(["tasks"]);
      expect(screen.getByRole("button", { name: "Show Tasks" })).toBeTruthy();
    });
    it("hidden module leaves the active list", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: "Hide Tasks" }));
      expect(screen.queryByRole("button", { name: "Hide Tasks" })).toBeNull();
    });
    it("showing returns it to the shelf", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: "Hide Tasks" }));
      fireEvent.click(screen.getByRole("button", { name: "Show Tasks" }));
      expect(readPrefs().hidden).toEqual([]);
    });
    it("shows the all-hidden message", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: "Hide Schedule" }));
      fireEvent.click(screen.getByRole("button", { name: "Hide Tasks" }));
      fireEvent.click(screen.getByRole("button", { name: "Hide Messages" }));
      fireEvent.click(screen.getByRole("button", { name: "Hide Markets" }));
      fireEvent.click(screen.getByRole("button", { name: "Hide Goals" }));
      fireEvent.click(screen.getByRole("button", { name: "Hide Contacts" }));
      fireEvent.click(screen.getByRole("button", { name: "Hide Pipeline" }));
      expect(screen.getByText(/All modules are hidden/i)).toBeTruthy();
    });
  });

  describe("open by default", () => {
    it("modules are open by default (switch checked)", () => {
      renderForm();
      expect(
        screen.getByRole("switch", { name: "Open Tasks by default" }).getAttribute("aria-checked"),
      ).toBe("true");
    });
    it("toggling minimizes and persists", () => {
      renderForm();
      fireEvent.click(screen.getByRole("switch", { name: "Open Tasks by default" }));
      expect(readPrefs().minimized).toContain("tasks");
    });
    it("toggling back opens it", () => {
      renderForm();
      const sw = screen.getByRole("switch", { name: "Open Tasks by default" });
      fireEvent.click(sw);
      fireEvent.click(sw);
      expect(readPrefs().minimized).not.toContain("tasks");
    });
  });

  describe("layout", () => {
    it("defaults to split selected", () => {
      renderForm();
      expect(
        screen.getByRole("tab", { name: "Split" }).getAttribute("aria-selected"),
      ).toBe("true");
    });
    it("choosing Stacked persists + updates selection", () => {
      renderForm();
      fireEvent.click(screen.getByRole("tab", { name: "Stacked" }));
      expect(readPrefs().layout).toBe("stacked");
      expect(
        screen.getByRole("tab", { name: "Stacked" }).getAttribute("aria-selected"),
      ).toBe("true");
    });
  });

  describe("behavior toggles", () => {
    it("Collapse on load persists", () => {
      renderForm();
      fireEvent.click(screen.getByRole("switch", { name: "Collapse modules on load" }));
      expect(readPrefs().sectionCollapsed).toBe(true);
    });
    it("Collapse on load is off by default", () => {
      renderForm();
      expect(
        screen.getByRole("switch", { name: "Collapse modules on load" }).getAttribute("aria-checked"),
      ).toBe("false");
    });
    it("Sync across devices persists", () => {
      renderForm();
      fireEvent.click(screen.getByRole("switch", { name: "Sync across devices" }));
      expect(readPrefs().sync).toBe(true);
    });
  });

  describe("reset", () => {
    it("restores defaults after changes", () => {
      renderForm();
      fireEvent.click(screen.getByRole("button", { name: "Hide Tasks" }));
      fireEvent.click(screen.getByRole("tab", { name: "Stacked" }));
      fireEvent.click(screen.getByRole("button", { name: /reset to defaults/i }));
      const p = readPrefs();
      expect(p.hidden).toEqual([]);
      expect(p.layout).toBe("split");
      expect(p.order).toEqual(defaultModulePrefs().order);
    });
    it("preserves the sync choice", () => {
      renderForm();
      fireEvent.click(screen.getByRole("switch", { name: "Sync across devices" }));
      fireEvent.click(screen.getByRole("button", { name: /reset to defaults/i }));
      expect(readPrefs().sync).toBe(true);
    });
  });
});
