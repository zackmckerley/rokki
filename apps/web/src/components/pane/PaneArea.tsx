"use client";

import { useState } from "react";
import { Columns2, Grid2x2, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePaneLayoutShortcuts } from "./usePaneLayoutShortcuts";

export type PaneLayout = "single" | "split-2" | "grid-4";

interface PaneAreaProps {
  /** Children = panes. The area renders them in the active layout. */
  children: React.ReactNode;
  /** Initial layout. Defaults to "single". Phase 4 persists per-user. */
  initialLayout?: PaneLayout;
}

/**
 * Multi-pane container. Hosts 1, 2, or 4 `PaneShell`s and exposes a
 * compact layout switcher in the top-right corner.
 *
 * Phase 0 wires the switcher purely as UI — actual multi-pane routing
 * (each pane with independent scope + module state) lands in Phase 4
 * along with `⌘1` / `⌘2` / `⌘4` and `⌘[` / `⌘]` shortcuts. Until
 * then the area renders whatever single child you hand it.
 */
export function PaneArea({
  children,
  initialLayout = "single",
}: PaneAreaProps) {
  const [layout, setLayout] = useState<PaneLayout>(initialLayout);
  // ⌘1 / ⌘2 / ⌘4 keyboard shortcuts. The handler skips when the
  // user is in a text field, so a digit key during typing doesn't
  // accidentally split the layout.
  usePaneLayoutShortcuts(setLayout);

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <LayoutSwitcher layout={layout} onChange={setLayout} />
      <div
        className={cn(
          "min-h-0 flex-1 p-3",
          layout === "single" && "grid grid-cols-1",
          layout === "split-2" && "grid grid-cols-1 gap-3 lg:grid-cols-2",
          layout === "grid-4" && "grid grid-cols-1 gap-3 lg:grid-cols-2 lg:grid-rows-2",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function LayoutSwitcher({
  layout,
  onChange,
}: {
  layout: PaneLayout;
  onChange: (next: PaneLayout) => void;
}) {
  return (
    <div className="absolute right-3 top-3 z-10 flex overflow-hidden rounded-sm border border-border bg-bg-2">
      {(
        [
          { key: "single", label: "Single pane (⌘1)", icon: Square },
          { key: "split-2", label: "Split 2 (⌘2)", icon: Columns2 },
          { key: "grid-4", label: "Grid 4 (⌘4)", icon: Grid2x2 },
        ] as const
      ).map(({ key, label, icon: Icon }, i) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          aria-pressed={layout === key}
          title={label}
          onClick={() => onChange(key)}
          className={cn(
            "px-1.5 py-0.5 text-text-2 transition-colors",
            i > 0 && "border-l border-border",
            layout === key
              ? "bg-accent text-bg-0"
              : "hover:bg-bg-3 hover:text-text-0",
          )}
        >
          <Icon className="h-3 w-3" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
