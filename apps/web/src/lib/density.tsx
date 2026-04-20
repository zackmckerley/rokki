"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

export type Density = "cozy" | "compact";

interface DensityApi {
  density: Density;
  setDensity: (d: Density) => void;
  toggle: () => void;
}

const DensityContext = createContext<DensityApi | null>(null);

/**
 * Global density preference. Persisted on `profiles.settings.density`.
 *
 * The selected value is also applied as a `data-density` attribute on
 * <html> so we can target `html[data-density="compact"] …` from CSS (or
 * Tailwind's data-attribute variants) without prop-drilling through every
 * component.
 */
export function DensityProvider({
  initial,
  children,
}: {
  initial: Density;
  children: ReactNode;
}) {
  const [density, setDensityState] = useState<Density>(initial);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.density = density;
    }
  }, [density]);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    void persist(d);
  }, []);

  const toggle = useCallback(
    () => setDensity(density === "cozy" ? "compact" : "cozy"),
    [density, setDensity],
  );

  return (
    <DensityContext.Provider value={{ density, setDensity, toggle }}>
      {children}
    </DensityContext.Provider>
  );
}

export function useDensity(): DensityApi {
  const ctx = useContext(DensityContext);
  if (!ctx)
    throw new Error("useDensity must be used inside <DensityProvider>");
  return ctx;
}

async function persist(density: Density) {
  try {
    const supa = createClient();
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user) return;
    // Read-modify-write the settings jsonb so we don't trample other keys.
    const { data: current } = await supa
      .from("profiles")
      .select("settings")
      .eq("user_id", user.id)
      .maybeSingle();
    const currentSettings =
      ((current as { settings?: Record<string, unknown> } | null)?.settings ??
        {}) as Record<string, unknown>;
    await supa
      .from("profiles")
      // @ts-expect-error generic update payload collapses to never
      .update({ settings: { ...currentSettings, density } })
      .eq("user_id", user.id);
  } catch {
    // localStorage fallback so the preference survives page reload even if
    // the network write fails.
    try {
      localStorage.setItem("rokki.density", density);
    } catch {
      /* ignore */
    }
  }
}

export function readInitialDensity(
  serverPref: Density | null,
): Density {
  if (serverPref) return serverPref;
  if (typeof window === "undefined") return "cozy";
  try {
    const v = localStorage.getItem("rokki.density");
    if (v === "cozy" || v === "compact") return v;
  } catch {
    /* ignore */
  }
  return "cozy";
}
