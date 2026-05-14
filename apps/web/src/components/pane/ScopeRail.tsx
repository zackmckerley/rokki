"use client";

import { useState } from "react";
import { ChevronDown, Plus, Settings, Home } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sidebar refit for the module-system UI. Scope-only — Home + Spaces
 * (collapsible) + Terminals (flat under their space). Modules do NOT
 * appear here; they live in the pane tab strip (see `PaneTabStrip`).
 *
 * Hover affordances on each row:
 *   - Space rows: `+` (new terminal) and `⚙` (space settings)
 *   - Terminal rows: `⚙` (terminal settings)
 *
 * Phase 0 wires this against in-memory fixtures. Phase 1 swaps the
 * fixture for real spaces/terminals data when the flag flips on for
 * the dashboard.
 */

export interface ScopeRailSpace {
  id: string;
  slug: string;
  name: string;
  dotColor?: string;
  terminals: Array<{
    id: string;
    ticker: string;
    name: string;
  }>;
}

interface ScopeRailProps {
  spaces: ScopeRailSpace[];
  /** id of the active scope (terminal id or space id) so the row highlights. */
  activeId?: string | null;
  /** Click handler for the Home row. */
  onSelectHome?: () => void;
  onSelectSpace?: (space: ScopeRailSpace) => void;
  onSelectTerminal?: (
    terminal: ScopeRailSpace["terminals"][number],
    space: ScopeRailSpace,
  ) => void;
  onAddTerminal?: (space: ScopeRailSpace) => void;
  onSpaceSettings?: (space: ScopeRailSpace) => void;
  onTerminalSettings?: (
    terminal: ScopeRailSpace["terminals"][number],
    space: ScopeRailSpace,
  ) => void;
}

export function ScopeRail({
  spaces,
  activeId = null,
  onSelectHome,
  onSelectSpace,
  onSelectTerminal,
  onAddTerminal,
  onSpaceSettings,
  onTerminalSettings,
}: ScopeRailProps) {
  return (
    <nav
      aria-label="Spaces and terminals"
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-bg-1 py-2"
    >
      <button
        type="button"
        onClick={onSelectHome}
        className={cn(
          "mx-2 flex items-center gap-2 rounded-sm px-2 py-1 text-left text-xs text-text-1 hover:bg-bg-2 hover:text-text-0",
          activeId === null && "bg-bg-2 text-text-0",
        )}
      >
        <Home className="h-3 w-3" aria-hidden="true" />
        <span>Home</span>
      </button>
      <ul role="list" className="mt-2 flex flex-col gap-0.5">
        {spaces.map((s) => (
          <SpaceRow
            key={s.id}
            space={s}
            activeId={activeId}
            onSelectSpace={onSelectSpace}
            onSelectTerminal={onSelectTerminal}
            onAddTerminal={onAddTerminal}
            onSpaceSettings={onSpaceSettings}
            onTerminalSettings={onTerminalSettings}
          />
        ))}
      </ul>
    </nav>
  );
}

function SpaceRow({
  space,
  activeId,
  onSelectSpace,
  onSelectTerminal,
  onAddTerminal,
  onSpaceSettings,
  onTerminalSettings,
}: {
  space: ScopeRailSpace;
  activeId: string | null;
  onSelectSpace?: ScopeRailProps["onSelectSpace"];
  onSelectTerminal?: ScopeRailProps["onSelectTerminal"];
  onAddTerminal?: ScopeRailProps["onAddTerminal"];
  onSpaceSettings?: ScopeRailProps["onSpaceSettings"];
  onTerminalSettings?: ScopeRailProps["onTerminalSettings"];
}) {
  const [open, setOpen] = useState(true);
  const isActive = activeId === space.id;
  return (
    <li role="listitem">
      <div
        className={cn(
          "group flex items-center gap-1.5 px-2 py-1 text-xs text-text-1 hover:bg-bg-2",
          isActive && "bg-bg-2 text-text-0",
        )}
      >
        <button
          type="button"
          aria-label={open ? "Collapse space" : "Expand space"}
          onClick={() => setOpen((v) => !v)}
          className="rounded-sm p-0.5 text-text-3 hover:text-text-0"
        >
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              !open && "-rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
        <span
          aria-hidden="true"
          className="h-2 w-2 flex-shrink-0 rounded-full"
          style={{ background: space.dotColor ?? "#7aa0c4" }}
        />
        <button
          type="button"
          onClick={() => onSelectSpace?.(space)}
          className="flex-1 truncate text-left font-semibold uppercase tracking-wide text-[11px] text-text-0"
        >
          {space.name}
        </button>
        <span className="hidden gap-0.5 group-hover:flex">
          {onAddTerminal ? (
            <button
              type="button"
              onClick={() => onAddTerminal(space)}
              aria-label={`New terminal in ${space.name}`}
              title={`New terminal in ${space.name}`}
              className="rounded-sm p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-0"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
          {onSpaceSettings ? (
            <button
              type="button"
              onClick={() => onSpaceSettings(space)}
              aria-label={`${space.name} settings`}
              title={`${space.name} settings — modules, members, integrations`}
              className="rounded-sm p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-0"
            >
              <Settings className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </span>
      </div>
      {open ? (
        <ul role="list" className="mt-0.5 flex flex-col gap-0.5">
          {space.terminals.length === 0 ? (
            <li className="px-7 py-1 text-[10px] italic text-text-3">
              no terminals yet
            </li>
          ) : null}
          {space.terminals.map((t) => {
            const active = activeId === t.id;
            return (
              <li key={t.id} role="listitem">
                <div
                  className={cn(
                    "group flex items-center gap-2 pl-7 pr-2 py-1 text-xs text-text-1 hover:bg-bg-2",
                    active && "bg-bg-2 text-text-0",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-text-3"
                  />
                  <button
                    type="button"
                    onClick={() => onSelectTerminal?.(t, space)}
                    className="flex-1 truncate text-left"
                  >
                    {t.name}
                  </button>
                  {onTerminalSettings ? (
                    <button
                      type="button"
                      onClick={() => onTerminalSettings(t, space)}
                      aria-label={`${t.name} settings`}
                      title={`${t.name} settings`}
                      className="hidden rounded-sm p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-0 group-hover:inline-flex"
                    >
                      <Settings className="h-3 w-3" aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

