"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  MODULE_CATALOG,
  MODULE_PREFS_STORAGE_KEY,
  LEGACY_MINIMIZED_KEY,
  defaultModulePrefs,
  normalizeModulePrefs,
  parseModulePrefs,
  migrateLegacyMinimized,
  serializeModulePrefs,
  modulePrefsEqual,
  orderedVisibleModules,
  hiddenModules as selectHiddenModules,
  setModuleHidden as pSetHidden,
  toggleModuleHidden as pToggleHidden,
  moveModule as pMove,
  moveModuleBy as pMoveBy,
  toggleModuleMinimized as pToggleMin,
  setModuleOpenByDefault as pSetOpen,
  setLayoutPreset as pSetLayout,
  setSectionCollapsed as pSetCollapsed,
  setSync as pSetSync,
  resetModulePrefs as pReset,
  type ModulePrefs,
  type ModuleCatalogItem,
  type DashLayoutPreset,
} from "@/lib/module-prefs";

/**
 * Provider for the dashboard's MODULES shelf preferences — what the
 * "Modules settings" gear edits, plus the live minimized/open state shared
 * between the explorer rail's Modules list and the DashboardPanels viewing
 * area. The pure model lives in `lib/module-prefs.ts`; this file is the
 * React + persistence wiring.
 *
 * Persistence: per-device in localStorage by default. When the user turns
 * on "Sync across devices" (#7), prefs also round-trip through
 * `profiles.preferences.modules` via `PATCH /api/v1/me` (no migration — the
 * preferences jsonb + deep-merge already exist).
 *
 * The context is null outside the provider so the rail can hide its Modules
 * section when it isn't hosting a dashboard (e.g. inside a terminal).
 */
export interface ModulePrefsContextValue {
  prefs: ModulePrefs;

  /* visibility — back-compat surface used by RailModules + DashboardPanels */
  minimized: Set<string>;
  isMinimized: (id: string) => boolean;
  toggle: (id: string) => void;

  /* rich setters (the settings panel) */
  setHidden: (id: string, hidden: boolean) => void;
  toggleHidden: (id: string) => void;
  move: (id: string, toIndex: number) => void;
  moveBy: (id: string, delta: number) => void;
  setOpenByDefault: (id: string, open: boolean) => void;
  setLayout: (layout: DashLayoutPreset) => void;
  setSectionCollapsed: (collapsed: boolean) => void;
  setSync: (sync: boolean) => void;
  reset: () => void;

  /* derived selectors */
  visibleModules: ModuleCatalogItem[];
  hiddenModules: ModuleCatalogItem[];
}

const Ctx = createContext<ModulePrefsContextValue | null>(null);

export function ModulePrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<ModulePrefs>(() => defaultModulePrefs());
  const [hydrated, setHydrated] = useState(false);
  const pulledFromServer = useRef(false);
  const lastPushed = useRef<string>("");

  // Hydrate from localStorage (with one-time migration off the legacy
  // minimized-only key) after mount, SSR-safe.
  useEffect(() => {
    let next: ModulePrefs | null = null;
    try {
      const raw = window.localStorage.getItem(MODULE_PREFS_STORAGE_KEY);
      if (raw) {
        next = parseModulePrefs(JSON.parse(raw));
      } else {
        const legacy = window.localStorage.getItem(LEGACY_MINIMIZED_KEY);
        if (legacy) {
          next = normalizeModulePrefs(migrateLegacyMinimized(JSON.parse(legacy)));
        }
      }
    } catch {
      /* fall back to defaults */
    }
    if (next) setPrefs(next);
    setHydrated(true);
  }, []);

  // Persist to localStorage on every change (also the offline cache when
  // sync is on).
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        MODULE_PREFS_STORAGE_KEY,
        JSON.stringify(serializeModulePrefs(prefs)),
      );
    } catch {
      /* non-fatal */
    }
  }, [prefs, hydrated]);

  // Sync ON → pull the server copy once, and treat it as authoritative.
  useEffect(() => {
    if (!hydrated || !prefs.sync || pulledFromServer.current) return;
    pulledFromServer.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/v1/me", { credentials: "include" });
        if (!res.ok) return;
        const body = (await res.json()) as {
          data?: { preferences?: { modules?: unknown } };
        };
        const remote = body.data?.preferences?.modules;
        if (remote && !cancelled) {
          const server = { ...parseModulePrefs(remote), sync: true };
          setPrefs((cur) => (modulePrefsEqual(cur, server) ? cur : server));
        }
      } catch {
        /* offline — keep local */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, prefs.sync]);

  // Sync ON → push prefs to the server (debounced) on change.
  useEffect(() => {
    if (!hydrated || !prefs.sync) return;
    const payload = JSON.stringify(serializeModulePrefs(prefs));
    if (payload === lastPushed.current) return;
    const t = setTimeout(() => {
      lastPushed.current = payload;
      void fetch("/api/v1/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ preferences: { modules: JSON.parse(payload) } }),
      }).catch(() => {
        // Reset so a later change retries the push.
        lastPushed.current = "";
      });
    }, 600);
    return () => clearTimeout(t);
  }, [prefs, hydrated]);

  const toggle = useCallback(
    (id: string) => setPrefs((p) => pToggleMin(p, id)),
    [],
  );

  const minimized = useMemo(() => new Set(prefs.minimized), [prefs.minimized]);

  const value = useMemo<ModulePrefsContextValue>(
    () => ({
      prefs,
      minimized,
      isMinimized: (id) => minimized.has(id),
      toggle,
      setHidden: (id, hidden) => setPrefs((p) => pSetHidden(p, id, hidden)),
      toggleHidden: (id) => setPrefs((p) => pToggleHidden(p, id)),
      move: (id, toIndex) => setPrefs((p) => pMove(p, id, toIndex)),
      moveBy: (id, delta) => setPrefs((p) => pMoveBy(p, id, delta)),
      setOpenByDefault: (id, open) => setPrefs((p) => pSetOpen(p, id, open)),
      setLayout: (layout) => setPrefs((p) => pSetLayout(p, layout)),
      setSectionCollapsed: (c) => setPrefs((p) => pSetCollapsed(p, c)),
      setSync: (s) => setPrefs((p) => pSetSync(p, s)),
      reset: () => setPrefs((p) => pReset(p)),
      visibleModules: orderedVisibleModules(prefs),
      hiddenModules: selectHiddenModules(prefs),
    }),
    [prefs, minimized, toggle],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Full prefs context, or null outside a provider. */
export function useModulePrefs(): ModulePrefsContextValue | null {
  return useContext(Ctx);
}

/* ---- back-compat: the original visibility surface ------------------ */

export interface ModuleVisibility {
  minimized: Set<string>;
  toggle: (id: string) => void;
  isMinimized: (id: string) => boolean;
}

/** Returns just the open/minimized controls, or null outside the provider.
 *  Kept so DashboardPanels and existing tests don't need rewiring. */
export function useModuleVisibility(): ModuleVisibility | null {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return {
    minimized: ctx.minimized,
    toggle: ctx.toggle,
    isMinimized: ctx.isMinimized,
  };
}

/** Back-compat alias — the provider grew from "visibility" into full prefs,
 *  but the mounted name in DashboardClient is unchanged. */
export const ModuleVisibilityProvider = ModulePrefsProvider;

/** The dashboard's modules, in catalog order. Retained for any consumer
 *  that imported the old constant; prefer `useModulePrefs().visibleModules`
 *  for the ordered, non-hidden list. */
export const DASH_MODULES: { id: string; label: string }[] = MODULE_CATALOG.map(
  (m) => ({ id: m.id, label: m.label }),
);
