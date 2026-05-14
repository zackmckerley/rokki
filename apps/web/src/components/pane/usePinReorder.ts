"use client";

import { useCallback, useRef, useState } from "react";
import type { InstalledModuleEntry } from "./types";

export interface PinReorderHandle {
  /** Current visual order. */
  order: InstalledModuleEntry[];
  /** Drag handlers for each tab. */
  onDragStart: (slug: string) => (e: React.DragEvent) => void;
  onDragOver: (slug: string) => (e: React.DragEvent) => void;
  onDrop: (slug: string) => (e: React.DragEvent) => void;
  /** Slug currently being dragged. UI may dim its tab. */
  dragging: string | null;
}

interface UsePinReorderArgs {
  scopeKind: "user" | "space" | "terminal";
  scopeId: string | null;
  initial: InstalledModuleEntry[];
  /**
   * Called with the new full pin set after each successful drop.
   * Debounce + persist via /api/v1/me/module-pins. The hook reorders
   * optimistically; the parent's persistence layer can fall back to
   * the optimistic value if the API fails.
   */
  onCommit?: (next: InstalledModuleEntry[]) => void;
}

/**
 * Drag-to-reorder for the pane tab strip. Tracks a local copy of the
 * order so the UI updates immediately on drop; the caller persists
 * via the /api/v1/me/module-pins PUT endpoint.
 *
 * Phase 4: HTML5 drag/drop is enough — the strip is short and the
 * interaction is rare. If we move to keyboard-driven reorder later,
 * swap this for a different state machine.
 */
export function usePinReorder({
  scopeKind: _scopeKind,
  scopeId: _scopeId,
  initial,
  onCommit,
}: UsePinReorderArgs): PinReorderHandle {
  const [order, setOrder] = useState<InstalledModuleEntry[]>(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const lastCommittedRef = useRef<string>(initial.map((m) => m.slug).join(","));

  const onDragStart = useCallback(
    (slug: string) => (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", slug);
      setDragging(slug);
    },
    [],
  );

  const onDragOver = useCallback(
    (_slug: string) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    [],
  );

  const onDrop = useCallback(
    (targetSlug: string) => (e: React.DragEvent) => {
      e.preventDefault();
      const sourceSlug = e.dataTransfer.getData("text/plain") || dragging;
      setDragging(null);
      if (!sourceSlug || sourceSlug === targetSlug) return;
      setOrder((cur) => {
        const next = reorder(cur, sourceSlug, targetSlug);
        const sig = next.map((m) => m.slug).join(",");
        if (sig !== lastCommittedRef.current) {
          lastCommittedRef.current = sig;
          onCommit?.(next);
        }
        return next;
      });
    },
    [dragging, onCommit],
  );

  return { order, onDragStart, onDragOver, onDrop, dragging };
}

/**
 * Move `sourceSlug` to immediately before `targetSlug` and renumber
 * displayOrder. Pure, exported so the unit test can hit it directly.
 */
export function reorder(
  list: InstalledModuleEntry[],
  sourceSlug: string,
  targetSlug: string,
): InstalledModuleEntry[] {
  const source = list.find((m) => m.slug === sourceSlug);
  if (!source) return list;
  const without = list.filter((m) => m.slug !== sourceSlug);
  const targetIdx = without.findIndex((m) => m.slug === targetSlug);
  if (targetIdx < 0) {
    // target was the dragged item; no-op
    return list;
  }
  const reordered = [
    ...without.slice(0, targetIdx),
    source,
    ...without.slice(targetIdx),
  ];
  return reordered.map((m, i) => ({ ...m, displayOrder: i }));
}
