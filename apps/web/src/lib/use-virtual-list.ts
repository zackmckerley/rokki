"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Tiny fixed-height-row virtual list.
 *
 *   const scrollRef = useRef<HTMLDivElement>(null);
 *   const v = useVirtualList({ count, rowHeight: 38, scrollRef, overscan: 6 });
 *
 *   <div ref={scrollRef} style={{ overflowY: "auto", height: "100%" }}>
 *     <div style={{ height: v.totalHeight, position: "relative" }}>
 *       {v.items.map((item) => (
 *         <div
 *           key={item.index}
 *           style={{
 *             position: "absolute",
 *             top: item.offset,
 *             left: 0,
 *             right: 0,
 *             height: rowHeight,
 *           }}
 *         >
 *           {renderRow(item.index)}
 *         </div>
 *       ))}
 *     </div>
 *   </div>
 *
 * Why no react-window dependency? The codebase pattern is to write small
 * hooks rather than pull external libs (see folder-path, mentions, etc.).
 * Variable-height rows aren't needed by any current consumer, so we don't
 * pay for a measurement pass — fixed height keeps the math constant time.
 *
 * The scroll container is owned by the caller. We only:
 *   1. Subscribe to its `scroll` event with passive: true
 *   2. Observe its size via ResizeObserver so the visible window updates
 *      when the container resizes (e.g. side panel opens)
 *   3. Compute the [start, end) row range and the absolute pixel offsets
 *
 * Layout uses `position: absolute` rather than transforms so consumers
 * can keep using regular DOM nodes (links, buttons, focus order).
 */

interface VirtualListOptions {
  /** Total number of rows. */
  count: number;
  /** Pixel height of each row. Must be uniform. */
  rowHeight: number;
  /** The scroll container — must have `overflow-y: auto` and a finite height. */
  scrollRef: React.RefObject<HTMLElement | null>;
  /**
   * Extra rows rendered above + below the viewport so quick scrolls don't
   * reveal blanks. Default 6 — about 200px at 32px row height.
   */
  overscan?: number;
}

export interface VirtualItem {
  index: number;
  offset: number;
}

export interface VirtualList {
  /** Rows in the viewport (+overscan), already sliced and offset-positioned. */
  items: VirtualItem[];
  /** Total inner height — set on a wrapper so the scrollbar matches reality. */
  totalHeight: number;
  /** Imperative: scroll the container so a given index is visible. */
  scrollToIndex: (index: number, opts?: { behavior?: ScrollBehavior }) => void;
}

export function useVirtualList(opts: VirtualListOptions): VirtualList {
  const { count, rowHeight, scrollRef, overscan = 6 } = opts;
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  // Latest count/rowHeight via refs so the effect callbacks see the
  // current values without re-binding listeners on every render.
  const countRef = useRef(count);
  countRef.current = count;
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;

  // Track scroll. Passive listener — virtual lists are read-only re: scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
    const onScroll = () => {
      setScrollTop(el.scrollTop);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  // Observe size so the visible-row window stays correct across resizes.
  // useLayoutEffect because we want the first measurement before paint —
  // otherwise the first render shows zero rows, flashes, then fills.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setViewportHeight(el.clientHeight);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setViewportHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);

  const items = useMemo<VirtualItem[]>(() => {
    if (count === 0 || viewportHeight === 0 || rowHeight <= 0) return [];
    const startIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const visibleCount = Math.ceil(viewportHeight / rowHeight);
    const endIdx = Math.min(count, startIdx + visibleCount + overscan * 2);
    const out: VirtualItem[] = [];
    for (let i = startIdx; i < endIdx; i++) {
      out.push({ index: i, offset: i * rowHeight });
    }
    return out;
  }, [count, rowHeight, overscan, scrollTop, viewportHeight]);

  const scrollToIndex = useCallback(
    (index: number, { behavior = "auto" }: { behavior?: ScrollBehavior } = {}) => {
      const el = scrollRef.current;
      if (!el) return;
      const top = Math.max(0, Math.min(index, countRef.current - 1)) *
        rowHeightRef.current;
      el.scrollTo({ top, behavior });
    },
    [scrollRef],
  );

  return {
    items,
    totalHeight: count * rowHeight,
    scrollToIndex,
  };
}
