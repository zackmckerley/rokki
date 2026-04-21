"use client";

import { useEffect, useState } from "react";

const CACHE_KEY = "rokki_flags_v1";
type Flags = Record<string, unknown>;

let cached: Flags | null = null;
let inflight: Promise<Flags> | null = null;

/**
 * Resolve a feature flag from the per-user `/api/v1/me/flags` map.
 *
 *   const showNew = useFlag<boolean>("dashboard_v2");
 *
 * Returns `defaultValue` until the first fetch completes (so server
 * components can pass through a known value). Cached for the lifetime
 * of the tab in sessionStorage.
 */
export function useFlag<T = unknown>(key: string, defaultValue: T): T {
  const [value, setValue] = useState<T>(() => readCachedValue(key, defaultValue));

  useEffect(() => {
    void getFlags().then((flags) => {
      if (key in flags) setValue(flags[key] as T);
    });
  }, [key]);

  return value;
}

/**
 * Imperatively read the full flag map. Used by non-component code.
 */
export async function getFlags(): Promise<Flags> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const cachedRaw =
        typeof sessionStorage !== "undefined"
          ? sessionStorage.getItem(CACHE_KEY)
          : null;
      if (cachedRaw) {
        cached = JSON.parse(cachedRaw) as Flags;
        return cached;
      }
    } catch {}
    try {
      const r = await fetch("/api/v1/me/flags", { credentials: "include" });
      if (r.ok) {
        const body = (await r.json()) as { data?: Flags };
        cached = body.data ?? {};
        try {
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(cached));
        } catch {}
        return cached;
      }
    } catch {}
    cached = {};
    return cached;
  })();
  const result = await inflight;
  inflight = null;
  return result;
}

function readCachedValue<T>(key: string, fallback: T): T {
  try {
    const raw =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(CACHE_KEY)
        : null;
    if (!raw) return fallback;
    const map = JSON.parse(raw) as Flags;
    if (key in map) return map[key] as T;
  } catch {}
  return fallback;
}
