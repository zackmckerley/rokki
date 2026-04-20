"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker on mount, in production only. Dev runs
 * without the SW so source-map/HMR aren't masked by stale cache.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        console.warn("[pwa] service worker failed to register:", err);
      });
  }, []);
  return null;
}
