"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

/**
 * Shared "which dashboard modules are minimized" state, so the explorer
 * rail's Modules list and the DashboardPanels viewing area stay in sync:
 *
 *   - Minimize a panel (the – in its header) → it leaves the viewing
 *     area and shows un-barred (minimized) in the rail's Modules list.
 *   - Click a module in the rail → it toggles back open into the panels.
 *
 * Persisted per-device, like the rest of the dashboard layout. The
 * context is null outside the provider so the rail can hide its Modules
 * section when it isn't hosting a dashboard (e.g. inside a terminal).
 */
const KEY = "rokki:dash-minimized-modules";

export interface ModuleVisibility {
  minimized: Set<string>;
  toggle: (id: string) => void;
  isMinimized: (id: string) => boolean;
}

const ModuleVisibilityContext = createContext<ModuleVisibility | null>(null);

export function ModuleVisibilityProvider({ children }: { children: ReactNode }) {
  const [minimized, setMinimized] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          setMinimized(
            new Set(parsed.filter((v): v is string => typeof v === "string")),
          );
        }
      }
    } catch {
      /* default: nothing minimized */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...minimized]));
    } catch {
      /* non-fatal */
    }
  }, [minimized, hydrated]);

  const value: ModuleVisibility = {
    minimized,
    isMinimized: (id) => minimized.has(id),
    toggle: (id) =>
      setMinimized((prev) => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      }),
  };

  return (
    <ModuleVisibilityContext.Provider value={value}>
      {children}
    </ModuleVisibilityContext.Provider>
  );
}

/** Returns the shared visibility controls, or null when not inside a
 *  ModuleVisibilityProvider (e.g. the rail rendered outside a dashboard). */
export function useModuleVisibility(): ModuleVisibility | null {
  return useContext(ModuleVisibilityContext);
}

/** The dashboard's modules, in rail display order. id matches the
 *  DashboardPanels panel id; label is what the rail shows. */
export const DASH_MODULES: { id: string; label: string }[] = [
  { id: "week", label: "Schedule" },
  { id: "tasks", label: "Tasks" },
  { id: "messages", label: "Messages" },
];
