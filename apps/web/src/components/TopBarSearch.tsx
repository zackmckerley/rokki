"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useCommands } from "@/lib/commands";

/**
 * Always-visible search affordance in the TopBar. Looks like an input
 * (with placeholder + ⌘K hint) but on focus or click it just opens the
 * existing CommandPalette — no separate input state, no duplicate
 * search wiring. The shortcut still works; this is purely about
 * discoverability so users don't need to know ⌘K to find the palette.
 */
export function TopBarSearch() {
  const palette = useCommandsSafe();
  const [shortcut, setShortcut] = useState("⌘K");

  // Show Ctrl+K on non-Mac, ⌘K on Mac, only after mount so SSR/CSR
  // markup matches.
  useEffect(() => {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);
    setShortcut(isMac ? "⌘K" : "Ctrl+K");
  }, []);

  // If we somehow rendered outside the palette provider, fall back to
  // showing a static hint kbd (still discoverable, just not clickable).
  if (!palette) {
    return (
      <kbd className="rounded-sm border border-border bg-bg-2 px-1.5 py-0.5 font-mono text-xs text-text-2">
        {shortcut}
      </kbd>
    );
  }

  return (
    <button
      type="button"
      onClick={() => palette.open()}
      aria-label="Open command palette"
      className="group flex h-7 w-64 items-center gap-2 rounded-sm border border-border bg-bg-2 px-2 text-left text-xs text-text-3 transition-colors hover:border-border-focus hover:bg-bg-3 focus-visible:border-border-focus focus-visible:outline-none"
    >
      <Search
        className="h-3 w-3 flex-shrink-0 text-text-3 group-hover:text-text-1"
        aria-hidden="true"
      />
      <span className="flex-1 truncate">Search commands, terminals, files…</span>
      <kbd className="hidden flex-shrink-0 rounded-sm border border-border bg-bg-1 px-1 font-mono text-[10px] text-text-3 sm:inline-block">
        {shortcut}
      </kbd>
    </button>
  );
}

function useCommandsSafe() {
  try {
    return useCommands();
  } catch {
    return null;
  }
}
