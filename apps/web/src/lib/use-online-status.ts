"use client";

import { useEffect, useState } from "react";

/**
 * Tracks `navigator.onLine`. Returns `true` until proven false to avoid
 * flashing "offline" during SSR / before hydration completes.
 *
 * `navigator.onLine` is a notoriously soft signal — a captive-portal Wi-Fi
 * still reports `true` while every fetch fails. The mutation queue's network-
 * error fallback is the real safety net; this hook is for UI cues.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return online;
}
