"use client";

import { Settings, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PaneTabStrip } from "./PaneTabStrip";
import type { PaneScope, ResolvedModules } from "./types";

interface PaneShellProps {
  /** Where this pane is rooted — drives the crumb + module list. */
  scope: PaneScope;
  /** Active module slug, or `null` for the synthesized Overview screen. */
  activeSlug: string | null;
  /** Modules installed at this scope, split into pinned + overflow. */
  modules: ResolvedModules;
  /** Pane content — the active module renders here. */
  children: React.ReactNode;
  /** True for the focused pane in a multi-pane layout. */
  focused?: boolean;
  /** Click handler for the close `×` icon. Pass `null` to hide. */
  onClose?: (() => void) | null;
  /** Click handler for the module-settings `⚙` icon. */
  onSettings?: (() => void) | null;
  /** Click handler when the user selects a tab. */
  onSelectTab?: (slug: string) => void;
  /** Click handler when the user clicks the `＋` add-module button. */
  onAddModule?: () => void;
}

/**
 * One pane: scope crumb + module tab strip + module content.
 *
 * Phase 0 renders a static fixture wired up against in-memory data —
 * no DB reads. The shell becomes the live mount surface for Tasks /
 * Schedule / Messenger / Files / Goals in Phase 1+.
 *
 * Layout:
 *
 *   ┌ scope · MODULE ────────── ⚙ × ┐
 *   │ Tab Tab [Tab] Tab Tab    ⋯ ＋ │
 *   ├────────────────────────────────┤
 *   │                                │
 *   │       module content           │
 *   │                                │
 *   └────────────────────────────────┘
 *
 * Focused panes show a 1px accent ring. F-key shortcuts target the
 * focused pane (wired in Phase 4).
 */
export function PaneShell({
  scope,
  activeSlug,
  modules,
  children,
  focused = false,
  onClose,
  onSettings,
  onSelectTab,
  onAddModule,
}: PaneShellProps) {
  const activeName = resolveActiveName(activeSlug, modules);
  return (
    <section
      aria-label={`${scope.label} pane`}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded border bg-bg-1",
        focused ? "border-accent/50 ring-1 ring-accent/20" : "border-border",
      )}
    >
      {/* Header: scope crumb + active module + controls */}
      <header className="flex items-center justify-between border-b border-border bg-bg-1 px-3 py-1.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wide text-text-3">
            {scope.label}
          </span>
          {activeName ? (
            <>
              <span className="text-text-3">·</span>
              <span className="truncate text-xs font-semibold text-text-0">
                {activeName}
              </span>
            </>
          ) : null}
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {onSettings ? (
            <button
              type="button"
              onClick={onSettings}
              aria-label="Module settings"
              className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
            >
              <Settings className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close pane"
              className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </header>
      {/* Tab strip: pinned modules + overflow + add */}
      <PaneTabStrip
        modules={modules}
        activeSlug={activeSlug}
        onSelect={onSelectTab}
        onAddModule={onAddModule}
      />
      {/* Body: active module content (or Overview synthetic) */}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  );
}

function resolveActiveName(
  activeSlug: string | null,
  modules: ResolvedModules,
): string {
  if (!activeSlug) return "Overview";
  const all = [...modules.pinned, ...modules.overflow];
  return all.find((m) => m.slug === activeSlug)?.name ?? "Overview";
}
