"use client";

import { cn } from "@/lib/utils";
import { useModuleVisibility, DASH_MODULES } from "./module-visibility";

/**
 * The explorer rail's "Modules" list. Minimal by design: each module is
 * just its name, conforming to the spaces rows (same indent/padding), and
 * the ONLY adornment is a far-right accent bar marking an *open* module.
 * No icon, no count, no bold — the bar is the single signal. Clicking a
 * row toggles the module open/minimized in the dashboard viewing area.
 *
 * Renders nothing when there's no dashboard host (no ModuleVisibility
 * provider) — e.g. the rail shown inside a terminal.
 */
export function RailModules() {
  const vis = useModuleVisibility();
  if (!vis) return null;
  return (
    <ul className="space-y-0.5 pl-[var(--rk-rail-indent)] text-xs">
      {DASH_MODULES.map((m) => {
        const open = !vis.isMinimized(m.id);
        return (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => vis.toggle(m.id)}
              aria-pressed={open}
              title={open ? `Minimize ${m.label}` : `Open ${m.label}`}
              className="group flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-left text-text-1 hover:bg-bg-2 hover:text-text-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {/* Empty chevron column so module names line up with space
                  names (not the space arrows). MUST use w-3, not w-3.5 —
                  this project's Tailwind config has a custom spacing scale
                  with NO 3.5 step, so w-3.5 generates no CSS and the spacer
                  collapses to 0, pulling the label left to the arrow column.
                  w-3 (12px) matches the space chevron's rendered width. */}
              <span className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
              <span className="flex-1 truncate text-xs">{m.label}</span>
              {/* far-right open indicator — the only color in the list */}
              <span
                aria-hidden="true"
                className={cn(
                  "h-3 w-[3px] flex-shrink-0 rounded",
                  open ? "bg-accent" : "bg-transparent",
                )}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
