// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import {
  ModuleVisibilityProvider,
  useModulePrefs,
  useModuleVisibility,
} from "./module-visibility";
import {
  MODULE_PREFS_STORAGE_KEY,
  LEGACY_MINIMIZED_KEY,
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

function Probe() {
  const ctx = useModulePrefs();
  if (!ctx) return <div data-testid="no-ctx" />;
  return (
    <div>
      <div data-testid="order">{ctx.prefs.order.join(",")}</div>
      <div data-testid="hidden">{ctx.prefs.hidden.join(",")}</div>
      <div data-testid="minimized">{ctx.prefs.minimized.join(",")}</div>
      <div data-testid="layout">{ctx.prefs.layout}</div>
      <div data-testid="collapsed">{String(ctx.prefs.sectionCollapsed)}</div>
      <div data-testid="sync">{String(ctx.prefs.sync)}</div>
      <button onClick={() => ctx.toggleHidden("tasks")}>hide</button>
      <button onClick={() => ctx.move("messages", 0)}>move</button>
      <button onClick={() => ctx.setSync(true)}>sync-on</button>
      <button onClick={() => ctx.reset()}>reset</button>
    </div>
  );
}

function VisProbe() {
  const vis = useModuleVisibility();
  return <div data-testid="vis">{vis ? "has-vis" : "no-vis"}</div>;
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModulePrefs provider", () => {
  it("useModulePrefs is null outside a provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("no-ctx")).toBeTruthy();
  });

  it("useModuleVisibility is null outside a provider", () => {
    render(<VisProbe />);
    expect(screen.getByTestId("vis").textContent).toBe("no-vis");
  });

  it("useModuleVisibility is available inside a provider", () => {
    render(
      <ModuleVisibilityProvider>
        <VisProbe />
      </ModuleVisibilityProvider>,
    );
    expect(screen.getByTestId("vis").textContent).toBe("has-vis");
  });

  it("renders defaults with no stored prefs", () => {
    render(
      <ModuleVisibilityProvider>
        <Probe />
      </ModuleVisibilityProvider>,
    );
    expect(screen.getByTestId("order").textContent).toBe("week,tasks,messages");
    expect(screen.getByTestId("layout").textContent).toBe("split");
    expect(screen.getByTestId("sync").textContent).toBe("false");
  });

  it("hydrates from stored prefs", async () => {
    seed({ order: ["messages", "tasks", "week"], layout: "stacked" });
    render(
      <ModuleVisibilityProvider>
        <Probe />
      </ModuleVisibilityProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("order").textContent).toBe("messages,tasks,week"),
    );
    expect(screen.getByTestId("layout").textContent).toBe("stacked");
  });

  it("migrates the legacy minimized key", async () => {
    window.localStorage.setItem(
      LEGACY_MINIMIZED_KEY,
      JSON.stringify(["tasks"]),
    );
    render(
      <ModuleVisibilityProvider>
        <Probe />
      </ModuleVisibilityProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("minimized").textContent).toBe("tasks"),
    );
  });

  it("persists a hide to localStorage", () => {
    render(
      <ModuleVisibilityProvider>
        <Probe />
      </ModuleVisibilityProvider>,
    );
    fireEvent.click(screen.getByText("hide"));
    expect(readPrefs().hidden).toEqual(["tasks"]);
  });

  it("persists a reorder to localStorage", () => {
    render(
      <ModuleVisibilityProvider>
        <Probe />
      </ModuleVisibilityProvider>,
    );
    fireEvent.click(screen.getByText("move"));
    expect(readPrefs().order).toEqual(["messages", "week", "tasks"]);
  });

  it("reset restores defaults but keeps sync", async () => {
    seed({ hidden: ["tasks"], layout: "stacked", sync: true });
    render(
      <ModuleVisibilityProvider>
        <Probe />
      </ModuleVisibilityProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("hidden").textContent).toBe("tasks"));
    fireEvent.click(screen.getByText("reset"));
    expect(screen.getByTestId("hidden").textContent).toBe("");
    expect(screen.getByTestId("layout").textContent).toBe("split");
    expect(screen.getByTestId("sync").textContent).toBe("true");
  });

  it("pulls server prefs when sync is on (GET /api/v1/me)", async () => {
    seed({ sync: true });
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              preferences: {
                modules: {
                  order: ["tasks", "week", "messages"],
                  hidden: [],
                  minimized: [],
                  layout: "stacked",
                  sectionCollapsed: false,
                  sync: true,
                },
              },
            },
          }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ModuleVisibilityProvider>
        <Probe />
      </ModuleVisibilityProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("layout").textContent).toBe("stacked"),
    );
    expect(fetchMock).toHaveBeenCalled();
    expect((fetchMock.mock.calls[0][0] as string)).toContain("/api/v1/me");
  });

  it("pushes prefs to the server when sync is enabled (PATCH /api/v1/me)", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: { preferences: {} } }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <ModuleVisibilityProvider>
        <Probe />
      </ModuleVisibilityProvider>,
    );
    fireEvent.click(screen.getByText("sync-on"));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            (c) => (c[1] as RequestInit | undefined)?.method === "PATCH",
          ),
        ).toBe(true),
      { timeout: 2000 },
    );
  });
});
