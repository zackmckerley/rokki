"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `onRefresh` when the tab regains focus, becomes visible again,
 * or the browser reconnects to the network.
 *
 * Why this exists: Rokki keeps the UI live via Supabase realtime
 * websockets. On a restrictive network — a corporate proxy or firewall
 * that blocks WSS, which is common on work computers — those pushes
 * never arrive, so the dashboard and task lists would silently show
 * stale data until the user did a full manual reload. Zack reported
 * exactly this: "it doesn't load the most recent information."
 *
 * Refetching whenever the user returns to the tab is the standard
 * resilience fallback (it's what React Query's `refetchOnWindowFocus`
 * does). It costs one refetch per focus event and guarantees the user
 * sees current data within a moment of looking at the app, realtime or
 * not.
 *
 * Guards:
 *   - Debounced ~150ms: `focus` and `visibilitychange` frequently both
 *     fire for a single tab switch; coalesce them into one refresh.
 *   - Min-interval floor (default 5s): rapid alt-tabbing won't hammer
 *     the server.
 *   - Skips while the document is hidden (a `focus` can fire on a
 *     background tab in some browsers).
 */
export function useRefreshOnFocus(
  onRefresh: () => void,
  { minIntervalMs = 5000 }: { minIntervalMs?: number } = {},
) {
  const lastRunRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep the latest callback without re-binding listeners every render.
  const cbRef = useRef(onRefresh);
  cbRef.current = onRefresh;

  useEffect(() => {
    function trigger() {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      if (timerRef.current) return; // a refresh is already scheduled
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        const now = Date.now();
        if (now - lastRunRef.current < minIntervalMs) return;
        lastRunRef.current = now;
        cbRef.current();
      }, 150);
    }
    function onVisibility() {
      if (document.visibilityState === "visible") trigger();
    }
    window.addEventListener("focus", trigger);
    window.addEventListener("online", trigger);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", trigger);
      window.removeEventListener("online", trigger);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [minIntervalMs]);
}
