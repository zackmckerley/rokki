"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isEditableTarget } from "@/lib/shortcuts";
import {
  useLeaderKey,
  DEFAULT_LEADER_ROUTES,
} from "@/lib/use-leader-key";
import { useCommands } from "@/lib/commands";

/**
 * Global keyboard shortcuts that aren't tied to a specific pane. Mounted
 * once at the root, just inside `<CommandPalette>` so we can call
 * `useCommands()` for the quick-switch chord.
 *
 * Bindings (kept in sync with `lib/shortcuts.ts` and `docs/08_UI_DESIGN.md
 * §8.6.1`):
 *   - `G then D / T / S / H` — go to Dashboard / Tools / Settings / Help
 *   - `⌘,`                   — open settings
 *   - `⌘⇧L`                  — toggle dark / light theme
 *   - `⌘⇧D`                  — toggle cozy / compact density
 *   - `⌘⇧P`                  — open the palette pre-filtered to terminals
 *
 * The theme + density toggles work directly on the `<html>` dataset and
 * mirror to localStorage — same approach as the boot script in
 * `app/layout.tsx`. No context needed, so this hook works on every page,
 * not just inside the dashboard tree.
 */
export function GlobalShortcuts() {
  const router = useRouter();
  const palette = useCommandsSafe();

  // G-leader chord routing. Mounted unconditionally so every page picks up
  // the navigation chords.
  useLeaderKey({ routes: DEFAULT_LEADER_ROUTES });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Never hijack typing.
      if (isEditableTarget(e.target)) return;

      const mod = e.metaKey || e.ctrlKey;

      // ⌘, → /settings. The browser maps ⌘, to "preferences" only in some
      // native menus; web pages keep it.
      if (mod && !e.shiftKey && !e.altKey && e.key === ",") {
        e.preventDefault();
        router.push("/settings");
        return;
      }

      // ⌘⇧L → toggle theme (light ⇄ dark). "System" preference is reset
      // because the user just expressed an explicit choice.
      if (mod && e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        toggleTheme();
        return;
      }

      // ⌘⇧D → toggle density (cozy ⇄ compact).
      if (mod && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        toggleDensity();
        return;
      }

      // ⌘⇧P → quick-switch terminal. Opens the palette; the user types
      // the ticker prefix or terminal name.
      if (mod && e.shiftKey && (e.key === "P" || e.key === "p")) {
        if (!palette) return;
        e.preventDefault();
        palette.open();
        return;
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, palette]);

  return null;
}

/**
 * Flip `<html data-theme>` and persist to localStorage. Matches the read
 * side in `app/layout.tsx` and `AppearanceForm.applyTheme`. Also
 * mirrors to `style.colorScheme` so native chrome repaints with the
 * dataset change rather than lagging until a refresh.
 */
function toggleTheme(): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const current = html.dataset.theme === "light" ? "light" : "dark";
  const next = current === "light" ? "dark" : "light";
  html.dataset.theme = next;
  html.style.colorScheme = next;
  try {
    localStorage.setItem("rokki_theme", next);
  } catch {
    /* ignore */
  }
}

/**
 * Flip `<html data-density>` and persist. Same write key as
 * `AppearanceForm.pickDensity` so a hard refresh keeps the choice.
 */
function toggleDensity(): void {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  const current = html.dataset.density === "compact" ? "compact" : "cozy";
  const next = current === "compact" ? "cozy" : "compact";
  html.dataset.density = next;
  try {
    localStorage.setItem("rokki_density", next);
  } catch {
    /* ignore */
  }
}

/**
 * `useCommands` throws when the provider isn't mounted (e.g. in unit tests
 * that render `GlobalShortcuts` standalone). Guard so the component still
 * renders without a palette — the rest of the bindings keep working.
 */
function useCommandsSafe() {
  try {
    return useCommands();
  } catch {
    return null;
  }
}
