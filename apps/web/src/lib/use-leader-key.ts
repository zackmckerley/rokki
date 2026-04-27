"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isEditableTarget } from "@/lib/shortcuts";

/**
 * Two-key chord navigation. Press the leader (default `G`) and then a
 * follow-up key within the timeout to jump to a route — `G then D` →
 * Dashboard, `G then T` → Tools, etc. This is the gmail/linear/superhuman
 * pattern.
 *
 * Mounted once at the layout root so every page can use it. Skips when
 * focus is in an editable target (typing "g" in a comment shouldn't trap
 * the next keystroke).
 *
 * Notes:
 *   - The leader is captured on `keydown`, not `keypress`, so it works on
 *     non-US keyboards too (we check `e.key`, not `e.code`).
 *   - Modifier keys (⌘/Ctrl/Alt) cancel the leader so `⌘G` (browser find)
 *     keeps working.
 *   - The timeout window resets on every keypress so a slow second key
 *     gracefully drops back to normal typing instead of mis-navigating.
 */

const DEFAULT_TIMEOUT_MS = 1500;

export interface LeaderRoute {
  /** Single character (case-insensitive) — the second keystroke. */
  key: string;
  /** Path to push when the chord fires. */
  path: string;
  /** Human label, used by the help reference (not by the binding itself). */
  label: string;
}

export interface UseLeaderKeyOptions {
  leader?: string;
  routes: LeaderRoute[];
  timeoutMs?: number;
}

export function useLeaderKey({
  leader = "g",
  routes,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: UseLeaderKeyOptions): void {
  const router = useRouter();

  useEffect(() => {
    let armed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const map = new Map<string, string>();
    for (const r of routes) map.set(r.key.toLowerCase(), r.path);

    function disarm() {
      armed = false;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function arm() {
      armed = true;
      if (timer) clearTimeout(timer);
      timer = setTimeout(disarm, timeoutMs);
    }

    function onKey(e: KeyboardEvent) {
      // Always defer to typing inside editable targets.
      if (isEditableTarget(e.target)) return;
      // Modifier-keyed shortcuts pass through untouched (⌘G stays browser).
      if (e.metaKey || e.ctrlKey || e.altKey) {
        disarm();
        return;
      }
      const key = e.key.toLowerCase();
      if (armed) {
        const path = map.get(key);
        if (path) {
          e.preventDefault();
          disarm();
          router.push(path);
          return;
        }
        // Anything else cancels the chord. Don't preventDefault so the
        // user's keystroke still does whatever it normally does.
        disarm();
        return;
      }
      if (key === leader.toLowerCase()) {
        e.preventDefault();
        arm();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timer) clearTimeout(timer);
    };
  }, [router, leader, routes, timeoutMs]);
}

/**
 * The default G-leader chord set. Mirrors `SHORTCUT_SECTIONS` in
 * `shortcuts.ts` so help and bindings can't drift.
 */
export const DEFAULT_LEADER_ROUTES: LeaderRoute[] = [
  { key: "d", path: "/", label: "Dashboard" },
  { key: "t", path: "/tools", label: "Tools" },
  { key: "s", path: "/settings", label: "Settings" },
  { key: "h", path: "/help", label: "Help" },
];
