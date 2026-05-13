"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PaneOverflowMenu } from "./PaneOverflowMenu";
import type { ResolvedModules } from "./types";

interface PaneTabStripProps {
  modules: ResolvedModules;
  activeSlug: string | null;
  onSelect?: (slug: string) => void;
  onAddModule?: () => void;
}

/**
 * The pinned-modules tab row with `⋯ More(N)` overflow + `＋` add.
 *
 * Pinned modules render in `modules.pinned` order. The shell decides
 * how many fit; the rest live in the overflow dropdown.
 *
 * Phase 0 is a static row — Phase 4 adds drag-to-reorder that writes
 * to `user_module_pins.display_order` (debounced).
 */
export function PaneTabStrip({
  modules,
  activeSlug,
  onSelect,
  onAddModule,
}: PaneTabStripProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  // Close overflow on outside click.
  useEffect(() => {
    if (!overflowOpen) return;
    function onDocClick(e: MouseEvent) {
      if (
        stripRef.current &&
        !stripRef.current.contains(e.target as Node)
      ) {
        setOverflowOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [overflowOpen]);

  function handleSelect(slug: string) {
    setOverflowOpen(false);
    onSelect?.(slug);
  }

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label="Modules"
      className="relative flex items-center gap-1 border-b border-border bg-bg-1 px-2 py-1"
    >
      {modules.pinned.map((m) => {
        const active = m.slug === activeSlug;
        return (
          <button
            key={m.slug}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => handleSelect(m.slug)}
            className={cn(
              "rounded-sm px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
              active
                ? "bg-bg-3 text-text-0"
                : "text-text-2 hover:bg-bg-2 hover:text-text-0",
            )}
          >
            {m.name}
          </button>
        );
      })}
      <div className="flex-1" />
      {modules.overflow.length > 0 ? (
        <button
          type="button"
          onClick={() => setOverflowOpen((v) => !v)}
          aria-expanded={overflowOpen}
          aria-haspopup="true"
          className={cn(
            "flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors",
            overflowOpen
              ? "bg-bg-3 text-text-0"
              : "bg-bg-2 text-text-2 hover:bg-bg-3 hover:text-text-0",
          )}
          title="More modules"
        >
          <span>⋯ More</span>
          <span className="rounded-sm bg-bg-3 px-1 font-mono text-[9px] text-text-3">
            {modules.overflow.length}
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 transition-transform",
              overflowOpen && "rotate-180",
            )}
            aria-hidden="true"
          />
        </button>
      ) : null}
      {onAddModule ? (
        <button
          type="button"
          onClick={onAddModule}
          aria-label="Add module to this scope"
          title="Add module"
          className="rounded-sm border border-border bg-bg-2 p-1 text-text-2 hover:bg-bg-3 hover:text-text-0"
        >
          <Plus className="h-3 w-3" aria-hidden="true" />
        </button>
      ) : null}
      {overflowOpen ? (
        <PaneOverflowMenu
          items={modules.overflow}
          activeSlug={activeSlug}
          onSelect={handleSelect}
          onAddModule={onAddModule}
        />
      ) : null}
    </div>
  );
}
