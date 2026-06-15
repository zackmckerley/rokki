// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { ModuleVisibilityProvider } from "./module-visibility";
import { ModuleSettings } from "./ModuleSettings";
import {
  MODULE_PREFS_STORAGE_KEY,
  defaultModulePrefs,
  type ModulePrefs,
} from "@/lib/module-prefs";

function readPrefs(): ModulePrefs | null {
  const raw = window.localStorage.getItem(MODULE_PREFS_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as ModulePrefs) : null;
}

function renderSettings() {
  return render(
    <ModuleVisibilityProvider>
      <ModuleSettings />
    </ModuleVisibilityProvider>,
  );
}

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: /module settings/i }));
  return screen.getByRole("dialog", { name: /module settings/i });
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
});

describe("ModuleSettings — gear + popover", () => {
  it("renders nothing outside a provider", () => {
    const { container } = render(<ModuleSettings />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the gear button inside a provider", () => {
    renderSettings();
    expect(screen.getByRole("button", { name: /module settings/i })).toBeTruthy();
  });

  it("popover is closed initially", () => {
    renderSettings();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clicking the gear opens the popover", () => {
    renderSettings();
    expect(openPanel()).toBeTruthy();
  });

  it("clicking the gear again closes the popover", () => {
    renderSettings();
    const gear = screen.getByRole("button", { name: /module settings/i });
    fireEvent.click(gear);
    expect(screen.queryByRole("dialog")).toBeTruthy();
    fireEvent.click(gear);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape closes the popover", () => {
    renderSettings();
    openPanel();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("gear reflects expanded state via aria-expanded", () => {
    renderSettings();
    const gear = screen.getByRole("button", { name: /module settings/i });
    expect(gear.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(gear);
    expect(gear.getAttribute("aria-expanded")).toBe("true");
  });

  it("lists the three modules", () => {
    renderSettings();
    const panel = openPanel();
    expect(within(panel).getByText("Schedule")).toBeTruthy();
    expect(within(panel).getByText("Tasks")).toBeTruthy();
    expect(within(panel).getByText("Messages")).toBeTruthy();
  });
});

describe("ModuleSettings — reorder (#2)", () => {
  it("moves a module up and persists", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Move Tasks up" }));
    expect(readPrefs()!.order).toEqual(["tasks", "week", "messages"]);
  });

  it("moves a module down and persists", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Move Schedule down" }));
    expect(readPrefs()!.order).toEqual(["tasks", "week", "messages"]);
  });

  it("disables Move up on the first module", () => {
    renderSettings();
    openPanel();
    expect(
      (screen.getByRole("button", { name: "Move Schedule up" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("disables Move down on the last module", () => {
    renderSettings();
    openPanel();
    expect(
      (screen.getByRole("button", { name: "Move Messages down" }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("reorder updates the rendered row order", () => {
    renderSettings();
    const panel = openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Move Messages up" }));
    const names = within(panel)
      .getAllByText(/^(Schedule|Tasks|Messages)$/)
      .map((n) => n.textContent);
    expect(names).toEqual(["Schedule", "Messages", "Tasks"]);
  });
});

describe("ModuleSettings — show / hide (#1/#8)", () => {
  it("hiding a module persists it to hidden", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Hide Tasks" }));
    expect(readPrefs()!.hidden).toEqual(["tasks"]);
  });

  it("hidden module appears in the Hidden tray with an Add control", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Hide Tasks" }));
    expect(screen.getByRole("button", { name: "Show Tasks" })).toBeTruthy();
  });

  it("hidden module is removed from the active list", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Hide Tasks" }));
    expect(screen.queryByRole("button", { name: "Hide Tasks" })).toBeNull();
  });

  it("showing a hidden module returns it to the shelf", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Hide Tasks" }));
    fireEvent.click(screen.getByRole("button", { name: "Show Tasks" }));
    expect(readPrefs()!.hidden).toEqual([]);
    expect(screen.getByRole("button", { name: "Hide Tasks" })).toBeTruthy();
  });

  it("shows the all-hidden message when everything is hidden", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Hide Schedule" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide Tasks" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide Messages" }));
    expect(screen.getByText(/All modules hidden/i)).toBeTruthy();
  });
});

describe("ModuleSettings — open by default (#3)", () => {
  it("modules are open by default (checkbox checked)", () => {
    renderSettings();
    openPanel();
    const cb = screen.getByRole("checkbox", { name: "Open Tasks by default" }) as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it("unchecking minimizes the module on load", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("checkbox", { name: "Open Tasks by default" }));
    expect(readPrefs()!.minimized).toContain("tasks");
  });

  it("re-checking opens it again", () => {
    renderSettings();
    openPanel();
    const cb = screen.getByRole("checkbox", { name: "Open Tasks by default" });
    fireEvent.click(cb);
    fireEvent.click(cb);
    expect(readPrefs()!.minimized).not.toContain("tasks");
  });
});

describe("ModuleSettings — layout (#5)", () => {
  it("defaults to split", () => {
    renderSettings();
    openPanel();
    expect(
      screen.getByRole("button", { name: "Split" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("choosing Stacked persists the preset", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Stacked" }));
    expect(readPrefs()!.layout).toBe("stacked");
  });

  it("choosing Stacked updates aria-pressed", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Stacked" }));
    expect(
      screen.getByRole("button", { name: "Stacked" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Split" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });
});

describe("ModuleSettings — collapse (#6) + sync (#7)", () => {
  it("Collapse on load persists", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("checkbox", { name: "Collapse on load" }));
    expect(readPrefs()!.sectionCollapsed).toBe(true);
  });

  it("Collapse on load is off by default", () => {
    renderSettings();
    openPanel();
    expect(
      (screen.getByRole("checkbox", { name: "Collapse on load" }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("Sync across devices persists", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sync across devices" }));
    expect(readPrefs()!.sync).toBe(true);
  });

  it("Sync is off by default", () => {
    renderSettings();
    openPanel();
    expect(
      (screen.getByRole("checkbox", { name: "Sync across devices" }) as HTMLInputElement).checked,
    ).toBe(false);
  });
});

describe("ModuleSettings — reset (#4)", () => {
  it("reset restores defaults after changes", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("button", { name: "Hide Tasks" }));
    fireEvent.click(screen.getByRole("button", { name: "Stacked" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Collapse on load" }));
    fireEvent.click(screen.getByRole("button", { name: /reset modules/i }));
    const p = readPrefs()!;
    expect(p.hidden).toEqual([]);
    expect(p.layout).toBe("split");
    expect(p.sectionCollapsed).toBe(false);
    expect(p.order).toEqual(defaultModulePrefs().order);
  });

  it("reset preserves the sync choice", () => {
    renderSettings();
    openPanel();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sync across devices" }));
    fireEvent.click(screen.getByRole("button", { name: /reset modules/i }));
    expect(readPrefs()!.sync).toBe(true);
  });
});
