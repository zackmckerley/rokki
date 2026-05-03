"use client";

import { useEffect, useState, type ReactNode } from "react";
import { FunctionKeys, type FunctionKey } from "./FunctionKeys";
import { TickerTape } from "./TickerTape";
import { CommandBar } from "./CommandBar";
import { ResizeHandle, useResizable } from "./ResizeHandle";
import { isEditableTarget } from "@/lib/shortcuts";

interface TerminalShellProps {
  topBar: ReactNode;
  functionKeys: FunctionKey[];
  activeKey?: string;
  onFunctionKey?: (key: string) => void;
  commandLabel?: string;
  tickerItems: { id: string; text: string; when: string }[];
  /** When set, the ticker tape receives live INSERT events for that project. */
  tickerProjectId?: string;
  /**
   * Global ExplorerRail (spaces tree, recents, tools, AccountBlock).
   * Rendered as the leftmost column of the shell, below the topbar +
   * function keys + ticker. Mirrors DashboardShell's left aside.
   */
  leftRail?: ReactNode;
  /**
   * Per-pane contextual rail (e.g. Status + Team summary on the
   * Overview tab). Renders to the right of leftRail when present.
   * F2/F3/F4 panes typically pass null here so the main content gets
   * the full remaining width.
   */
  leftPane: ReactNode;
  mainPane: ReactNode;
  rightPane?: ReactNode;
}

/**
 * Rokki Terminal shell (§08.5.4 Terminal layout).
 *
 * Desktop (≥1024px): classic 3-pane terminal with left rail, main, right pane.
 * Tablet (≥640px):   2-pane — left rail + main; right pane tucks under main.
 * Mobile (<640px):   single pane. F-keys become a bottom tab bar; the left
 *                    rail is hidden (its content is surfaced through the
 *                    command palette instead). Ticker tape is hidden.
 */
export function TerminalShell({
  topBar,
  functionKeys,
  activeKey,
  onFunctionKey,
  commandLabel,
  tickerItems,
  tickerProjectId,
  leftRail,
  leftPane,
  mainPane,
  rightPane,
}: TerminalShellProps) {
  const [internalActive, setInternalActive] = useState(activeKey);
  const active = activeKey ?? internalActive;

  // Pane visibility (user-toggleable via ⌘\ / ⌘⇧\). Left pane defaults
  // hidden below `lg` because the viewport is too narrow — the keyboard
  // shortcut is desktop-only.
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

  // Resizable column widths. Sizes persist per-user across all
  // terminals — the ratio of "explorer / context / main / right"
  // is a personal preference, not a per-terminal concern. Add a
  // per-project override later if a use case shows up.
  const explorerRail = useResizable({
    storageKey: "rokki:term-explorer-width",
    defaultSize: 260,
    min: 200,
    max: 480,
  });
  const ctxPane = useResizable({
    storageKey: "rokki:term-leftpane-width",
    defaultSize: 360,
    min: 240,
    max: 560,
  });
  const rightSidePane = useResizable({
    storageKey: "rokki:term-rightpane-width",
    defaultSize: 360,
    min: 280,
    max: 560,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key !== "\\") return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) {
        setLeftOpen((v) => !v);
      } else {
        setRightOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function handle(k: string) {
    setInternalActive(k);
    onFunctionKey?.(k);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {topBar}
      <div className="hidden sm:block">
        <FunctionKeys keys={functionKeys} active={active} onSelect={handle} />
      </div>
      <div className="hidden sm:block">
        <TickerTape items={tickerItems} projectId={tickerProjectId} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden sm:flex-row">
        {leftOpen && leftRail ? (
          <>
            <aside
              aria-label="Explorer"
              style={{ width: explorerRail.size }}
              className="hidden flex-shrink-0 overflow-y-auto border-r border-border bg-bg-0 lg:flex lg:flex-col"
            >
              {leftRail}
            </aside>
            <div className="hidden lg:block">
              <ResizeHandle
                ariaLabel="Resize explorer"
                onPointerDown={(e) =>
                  explorerRail.startDrag(e, { side: "before" })
                }
              />
            </div>
          </>
        ) : null}
        {leftOpen && leftPane ? (
          <>
            <div
              style={{ width: ctxPane.size }}
              className="hidden flex-shrink-0 overflow-y-auto border-r border-border bg-bg-0 lg:block"
            >
              {leftPane}
            </div>
            <div className="hidden lg:block">
              <ResizeHandle
                ariaLabel="Resize context pane"
                onPointerDown={(e) =>
                  ctxPane.startDrag(e, { side: "before" })
                }
              />
            </div>
          </>
        ) : null}
        <div className="flex-1 overflow-y-auto bg-bg-0">{mainPane}</div>
        {rightPane && rightOpen ? (
          <>
            <div className="hidden lg:block">
              <ResizeHandle
                ariaLabel="Resize right pane"
                onPointerDown={(e) =>
                  rightSidePane.startDrag(e, { side: "after" })
                }
              />
            </div>
            <div
              style={{ width: rightSidePane.size }}
              className="hidden flex-shrink-0 overflow-y-auto border-t border-border bg-bg-0 sm:block sm:border-l sm:border-t-0"
            >
              {rightPane}
            </div>
          </>
        ) : null}
      </div>
      <div className="sm:hidden">
        <FunctionKeys keys={functionKeys} active={active} onSelect={handle} />
      </div>
      <div className="hidden sm:block">
        <CommandBar label={commandLabel} />
      </div>
    </div>
  );
}
