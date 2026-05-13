"use client";

import { Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InstalledModuleEntry } from "./types";

interface PaneOverflowMenuProps {
  items: InstalledModuleEntry[];
  activeSlug: string | null;
  onSelect: (slug: string) => void;
  onAddModule?: () => void;
}

/**
 * Dropdown content for the `⋯ More` button on the tab strip. Lists
 * the overflow modules (those installed but not pinned) plus the
 * "Add module…" and "Manage modules…" footer actions. The strip
 * owns open/close state and outside-click dismissal; this component
 * only renders.
 */
export function PaneOverflowMenu({
  items,
  activeSlug,
  onSelect,
  onAddModule,
}: PaneOverflowMenuProps) {
  return (
    <div
      role="menu"
      aria-label="More modules"
      className="absolute right-2 top-full z-30 mt-1 w-64 overflow-hidden rounded-sm border border-border bg-bg-1 shadow-lg"
    >
      {items.length > 0 ? (
        <>
          <p className="border-b border-border bg-bg-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
            Installed · in this scope
          </p>
          <ul className="py-1 text-xs">
            {items.map((m) => {
              const active = m.slug === activeSlug;
              return (
                <li key={m.slug}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => onSelect(m.slug)}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left",
                      active
                        ? "bg-bg-3 text-text-0"
                        : "text-text-1 hover:bg-bg-2",
                    )}
                  >
                    <span aria-hidden="true">◎</span>
                    <span className="flex-1 truncate">{m.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p className="px-3 py-2 text-[11px] text-text-3">
          No additional modules installed here.
        </p>
      )}
      <div className="border-t border-border bg-bg-1 py-1 text-xs">
        {onAddModule ? (
          <button
            type="button"
            onClick={onAddModule}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-text-1 hover:bg-bg-2"
          >
            <Plus className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
            <span>Add module…</span>
          </button>
        ) : null}
        <button
          type="button"
          // Phase 3 wires this to /s/[slug]/settings/modules etc.
          disabled
          title="Marketplace lands in Phase 3"
          className="flex w-full cursor-not-allowed items-center gap-2 px-3 py-1.5 text-left text-text-3"
        >
          <Settings className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span>Manage modules…</span>
        </button>
      </div>
    </div>
  );
}
