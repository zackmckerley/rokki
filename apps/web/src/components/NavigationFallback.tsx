"use client";

import { useEffect } from "react";

/**
 * Workaround for a bug where router.push() silently no-ops on certain
 * pages (no fetch, no URL change, no error). Diagnosed live: clicking
 * any next/link Link inside TerminalShell calls preventDefault on the
 * native event (Next.js intercepting normally) but the subsequent
 * router.push never lands the URL.
 *
 * Listener strategy:
 *   1. capture-phase document click on every <a href> with a same-
 *      origin internal target
 *   2. record the href + URL before
 *   3. check after 250ms whether the URL has changed
 *   4. if not, fall back to window.location.assign(href) — a hard
 *      browser nav that doesn't depend on Next.js's client router
 *
 * Pure observe-then-rescue: never preventDefault on its own, never
 * stops propagation, never interferes with Link's normal behavior on
 * pages where the router actually works.
 */
export function NavigationFallback() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    function onClick(e: MouseEvent) {
      // Only respond to plain left-clicks. Cmd-click / middle-click /
      // shift-click open in new tabs and should not be hijacked.
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;
      // Skip external + protocol links.
      if (/^(https?:|mailto:|tel:|ftp:)/i.test(href)) {
        try {
          const u = new URL(href, window.location.href);
          if (u.origin !== window.location.origin) return;
        } catch {
          return;
        }
      }
      // Skip anchors that target a different frame.
      const tgt = anchor.getAttribute("target");
      if (tgt && tgt !== "_self") return;
      // Skip download links.
      if (anchor.hasAttribute("download")) return;

      const before = window.location.href;
      const resolvedHref = anchor.href;

      window.setTimeout(() => {
        // If URL didn't change AND the click default was prevented,
        // Next.js's router intercepted but didn't actually navigate.
        // Force a hard navigation so the user isn't stranded.
        if (window.location.href === before && e.defaultPrevented) {
          console.warn(
            "[NavigationFallback] router.push silently no-op'd; falling back to hard nav:",
            resolvedHref,
          );
          window.location.assign(resolvedHref);
        }
      }, 250);
    }

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
