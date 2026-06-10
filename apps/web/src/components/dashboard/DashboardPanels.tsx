"use client";

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { GripVertical, Maximize2, Minimize2, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PanelControlsProvider } from "./panel-handle";
import { useModuleVisibility } from "./module-visibility";
import {
  DASH_LAYOUT_STORAGE_KEY,
  DEFAULT_DASH_LAYOUT,
  gridTemplate,
  movePanel,
  normalizeLayout,
  type DashColumn,
  type DashLayout,
} from "@/lib/dashboard-layout";

const TITLES: Record<string, string> = {
  week: "Week",
  tasks: "Tasks",
  messages: "Messages",
};

type DropHint =
  | { kind: "panel"; id: string; after: boolean }
  | { kind: "col"; col: DashColumn }
  | null;

/**
 * The rearrangeable dashboard. Week / Tasks / Messages are panels laid
 * out across two columns; the user can:
 *   - drag a reciprocal splitter between stacked panels (one grows, its
 *     neighbour shrinks),
 *   - drag a panel by its header grip to reorder or move it to the other
 *     column,
 *   - and when a column empties, the other expands to full width.
 *
 * The arrangement (column assignment + order + sizes) persists per-device
 * in localStorage. Below `lg` the whole thing degrades to a simple
 * natural-height stack (no drag/resize — those gestures don't translate
 * to touch); panels render exactly once, so no card double-mounts.
 */
export function DashboardPanels({
  focus,
  briefing,
  week,
  tasks,
  messages,
}: {
  focus?: ReactNode;
  briefing: ReactNode;
  week: ReactNode;
  tasks: ReactNode;
  messages: ReactNode;
}) {
  const nodes: Record<string, ReactNode> = { week, tasks, messages };

  const [hydrated, setHydrated] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [layout, setLayout] = useState<DashLayout>(DEFAULT_DASH_LAYOUT);
  const [weights, setWeights] = useState<Record<string, number>>({
    week: 1,
    tasks: 1,
    messages: 1,
  });
  const [centerFrac, setCenterFrac] = useState(0.6);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hint, setHint] = useState<DropHint>(null);
  // Which panel is maximized (fills the whole viewing area), or null.
  // Deliberately NOT persisted — it's a transient view, not a saved
  // preference, so a reload returns to the normal arrangement.
  const [maximizedId, setMaximizedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Minimized modules (shared with the explorer rail's Modules list).
  // A minimized panel is dropped from the viewing area but kept in
  // `layout`, so restoring it from the rail puts it back in its slot.
  const vis = useModuleVisibility();
  function visibleInCol(col: DashColumn): string[] {
    const m = vis?.minimized;
    return m ? layout[col].filter((id) => !m.has(id)) : layout[col];
  }

  // Track the lg breakpoint so the dynamic inline styles (panel flex,
  // grid template) only apply on desktop; mobile stays a natural stack.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Hydrate the saved arrangement after mount (SSR-safe).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DASH_LAYOUT_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as {
          layout?: Partial<DashLayout>;
          weights?: Record<string, number>;
          centerFrac?: number;
        };
        setLayout(normalizeLayout(p.layout));
        if (p.weights && typeof p.weights === "object") {
          setWeights((w) => ({ ...w, ...p.weights }));
        }
        if (typeof p.centerFrac === "number") setCenterFrac(p.centerFrac);
      }
    } catch {
      /* fall back to defaults */
    }
    setHydrated(true);
  }, []);

  // Persist on change.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(
        DASH_LAYOUT_STORAGE_KEY,
        JSON.stringify({ layout, weights, centerFrac }),
      );
    } catch {
      /* non-fatal */
    }
  }, [layout, weights, centerFrac, hydrated]);

  /* ---------------- drag-and-drop (rearrange) ---------------- */
  function endDrag() {
    setDragId(null);
    setHint(null);
  }
  function onPanelDragOver(id: string, e: DragEvent) {
    if (!dragId || dragId === id) return;
    e.preventDefault();
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const after = e.clientY - r.top > r.height / 2;
    setHint((h) =>
      h && h.kind === "panel" && h.id === id && h.after === after
        ? h
        : { kind: "panel", id, after },
    );
  }
  function onPanelDrop(id: string, col: DashColumn, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragId) return;
    const after = hint?.kind === "panel" && hint.id === id && hint.after;
    const idx = layout[col].indexOf(id) + (after ? 1 : 0);
    setLayout((l) => movePanel(l, dragId, col, idx));
    endDrag();
  }
  function onColumnDragOver(col: DashColumn, e: DragEvent) {
    if (!dragId) return;
    e.preventDefault();
    setHint((h) => (h && h.kind === "col" && h.col === col ? h : { kind: "col", col }));
  }
  function onColumnDrop(col: DashColumn, e: DragEvent) {
    if (!dragId || e.defaultPrevented) return;
    e.preventDefault();
    setLayout((l) => movePanel(l, dragId, col, l[col].length));
    endDrag();
  }

  /* ---------------- reciprocal vertical splitter ---------------- */
  // DOM-direct during the drag (no re-render per move), commit to state
  // on release. React owns `style.flex` so the committed value replaces
  // the transient one on the next render — no stale inline style.
  function startVSplit(
    col: DashColumn,
    idxAbove: number,
    e: PointerEvent<HTMLDivElement>,
  ) {
    e.preventDefault();
    const colEl = containerRef.current?.querySelector<HTMLElement>(
      `[data-col="${col}"]`,
    );
    if (!colEl) return;
    const panels = [...colEl.querySelectorAll<HTMLElement>("[data-panel-id]")];
    const above = panels[idxAbove];
    const below = panels[idxAbove + 1];
    if (!above || !below) return;
    const kA = above.dataset.panelId!;
    const kB = below.dataset.panelId!;
    const wA = weights[kA] ?? 1;
    const wB = weights[kB] ?? 1;
    const sum = wA + wB;
    const pairPx = above.offsetHeight + below.offsetHeight;
    const startY = e.clientY;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    let finalA = wA;
    let finalB = wB;
    const move = (ev: globalThis.PointerEvent) => {
      const frac = pairPx > 0 ? (ev.clientY - startY) / pairPx : 0;
      const minW = sum * 0.14;
      const nA = Math.max(minW, Math.min(sum - minW, wA + frac * sum));
      finalA = nA;
      finalB = sum - nA;
      above.style.flex = `${finalA} 1 0`;
      below.style.flex = `${finalB} 1 0`;
    };
    const up = () => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setWeights((w) => ({ ...w, [kA]: finalA, [kB]: finalB }));
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  /* ---------------- column-width splitter ---------------- */
  function startColSplit(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const grid = containerRef.current?.querySelector<HTMLElement>("[data-cols]");
    if (!grid) return;
    const W = grid.clientWidth - 9;
    const startX = e.clientX;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    let finalFrac = centerFrac;
    const move = (ev: globalThis.PointerEvent) => {
      finalFrac = Math.max(
        0.25,
        Math.min(0.78, centerFrac + (ev.clientX - startX) / W),
      );
      grid.style.gridTemplateColumns = `${finalFrac}fr 9px ${1 - finalFrac}fr`;
    };
    const up = () => {
      target.releasePointerCapture(e.pointerId);
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      setCenterFrac(finalFrac);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  }

  function resetLayout() {
    setLayout(normalizeLayout(DEFAULT_DASH_LAYOUT));
    setWeights({ week: 1, tasks: 1, messages: 1 });
    setCenterFrac(0.6);
  }

  /* ---------------- render helpers ---------------- */
  function panelGrip(id: string): ReactNode {
    return (
      <button
        type="button"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", id);
          setDragId(id);
        }}
        onDragEnd={endDrag}
        aria-label={`Move ${TITLES[id] ?? "panel"}`}
        title="Drag to move or reorder"
        className="hidden h-5 w-4 flex-shrink-0 cursor-grab items-center justify-center rounded-sm text-text-3 hover:bg-bg-3 hover:text-text-1 active:cursor-grabbing lg:flex"
      >
        {/* h-4 w-4, NOT h-3.5 — the custom Tailwind spacing scale has no 3.5
            step, so h-3.5/w-3.5 generate no CSS and the icon falls back to
            its 24px intrinsic size (oversized). 16px is a valid, grabbable
            handle. */}
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  // Maximize / restore toggle. Replaces the card's expand link when the
  // panel is hosted here (desktop only); clicking fills the viewing area
  // with this module, clicking again restores the prior arrangement.
  function panelMaxBtn(id: string): ReactNode {
    const isMax = maximizedId === id;
    return (
      <button
        type="button"
        onClick={() => setMaximizedId(isMax ? null : id)}
        aria-label={
          isMax
            ? `Restore ${TITLES[id] ?? "panel"}`
            : `Maximize ${TITLES[id] ?? "panel"}`
        }
        title={isMax ? "Restore" : "Maximize"}
        className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
      >
        {isMax ? (
          <Minimize2 className="h-3 w-3" aria-hidden="true" />
        ) : (
          <Maximize2 className="h-3 w-3" aria-hidden="true" />
        )}
      </button>
    );
  }

  // Minimize — drops the panel out of the viewing area into the rail's
  // Modules list (click it there to bring it back).
  function panelMinBtn(id: string): ReactNode {
    if (!vis) return null;
    return (
      <button
        type="button"
        onClick={() => {
          if (maximizedId === id) setMaximizedId(null);
          vis.toggle(id);
        }}
        aria-label={`Minimize ${TITLES[id] ?? "panel"}`}
        title="Minimize"
        className="rounded-sm p-1 text-text-3 hover:bg-bg-2 hover:text-text-0"
      >
        <Minus className="h-3 w-3" aria-hidden="true" />
      </button>
    );
  }

  function renderPanel(id: string, col: DashColumn) {
    const before = hint?.kind === "panel" && hint.id === id && !hint.after;
    const after = hint?.kind === "panel" && hint.id === id && hint.after;
    const isMax = maximizedId === id;
    const hiddenByMax = maximizedId != null && !isMax;
    const style: CSSProperties = isDesktop
      ? { flex: isMax ? "1 1 0" : `${weights[id] ?? 1} 1 0` }
      : {};
    return (
      <PanelControlsProvider
        key={id}
        value={{
          // No drag grip while a panel is maximized.
          handle: maximizedId ? null : panelGrip(id),
          maximize: isDesktop ? panelMaxBtn(id) : null,
          // No minimize while maximized — restore first.
          minimize: isDesktop && !maximizedId ? panelMinBtn(id) : null,
        }}
      >
        <div
          data-panel-id={id}
          style={style}
          onDragOver={(e) => onPanelDragOver(id, e)}
          onDrop={(e) => onPanelDrop(id, col, e)}
          onDragLeave={() =>
            setHint((h) => (h?.kind === "panel" && h.id === id ? null : h))
          }
          className={cn(
            "relative min-h-0 flex-none overflow-hidden lg:flex-1 lg:[&>*]:h-full",
            // Hide the other panels (desktop) while one is maximized.
            hiddenByMax && "lg:hidden",
            dragId === id && "opacity-40",
            before && "shadow-[inset_0_3px_0_0_var(--accent)]",
            after && "shadow-[inset_0_-3px_0_0_var(--accent)]",
          )}
        >
          {nodes[id]}
        </div>
      </PanelControlsProvider>
    );
  }

  function renderColumn(col: DashColumn) {
    const ids = visibleInCol(col);
    const emptyHighlight =
      hint?.kind === "col" && hint.col === col && ids.length === 0;
    return (
      <section
        data-col={col}
        onDragOver={(e) => onColumnDragOver(col, e)}
        onDrop={(e) => onColumnDrop(col, e)}
        className={cn(
          "flex min-h-0 min-w-0 flex-col gap-2 lg:gap-0 lg:overflow-hidden",
          emptyHighlight && "rounded outline-2 outline-dashed outline-accent/50",
        )}
      >
        {ids.map((id, i) => (
          <Fragment key={id}>
            {renderPanel(id, col)}
            {isDesktop && !maximizedId && i < ids.length - 1 ? (
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="Resize panels"
                onPointerDown={(e) => startVSplit(col, i, e)}
                className="group flex h-2 flex-shrink-0 cursor-row-resize items-center justify-center"
              >
                <span className="h-[3px] w-11 rounded bg-border-strong transition-colors group-hover:bg-accent" />
              </div>
            ) : null}
          </Fragment>
        ))}
      </section>
    );
  }

  // Two columns are forced only while a panel is mid-drag, so the emptied
  // side stays a reachable drop target. When NOT dragging, an empty column
  // collapses and the occupied column takes the FULL width (Zack: "if all
  // the modules are in the same column, they should take up the full area,
  // not just the column"). gridTemplate() handles the collapse.
  const forceTwo = dragId != null;
  // Only the non-minimized panels affect the layout/collapse maths.
  const visLayout: DashLayout = {
    center: visibleInCol("center"),
    right: visibleInCol("right"),
  };
  // Which column the maximized panel lives in (so the grid collapses the
  // other column to 0 and the maximized one takes the full width).
  const maxCol = maximizedId
    ? layout.center.includes(maximizedId)
      ? "center"
      : "right"
    : null;
  const grid = maximizedId
    ? maxCol === "center"
      ? "1fr 0 0"
      : "0 0 1fr"
    : gridTemplate(visLayout, centerFrac, forceTwo);
  const showColSplit =
    isDesktop &&
    !maximizedId &&
    (forceTwo || (visLayout.center.length > 0 && visLayout.right.length > 0));

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 flex-col gap-2 p-2 sm:p-3 lg:h-full"
    >
      {/* Briefing + focus banners hide while a module is maximized so it
          truly fills the viewing area. */}
      <div className={cn("flex flex-col gap-2", maximizedId && "lg:hidden")}>
        {focus}
        {briefing}
      </div>
      <div
        data-cols
        className="grid grid-cols-1 gap-2 lg:min-h-0 lg:flex-1 lg:grid-cols-[1.6fr_9px_1fr] lg:gap-0 lg:overflow-hidden"
        style={
          isDesktop
            ? { gridTemplateColumns: grid, transition: "grid-template-columns .14s ease" }
            : undefined
        }
      >
        {renderColumn("center")}
        {showColSplit ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize columns"
            onPointerDown={startColSplit}
            className="group hidden cursor-col-resize items-center justify-center lg:flex"
          >
            <span className="h-9 w-[3px] rounded bg-border-strong transition-colors group-hover:bg-accent" />
          </div>
        ) : (
          <div className="hidden lg:block" aria-hidden="true" />
        )}
        {renderColumn("right")}
      </div>
      {/* Reset — small, unobtrusive, desktop-only (mobile can't rearrange). */}
      {isDesktop ? (
        <div className="hidden flex-shrink-0 justify-end lg:flex">
          <button
            type="button"
            onClick={resetLayout}
            className="rounded-sm px-2 py-0.5 font-mono text-2xs uppercase tracking-wide text-text-3 hover:bg-bg-2 hover:text-text-1"
            title="Reset the dashboard layout to its default"
          >
            ↺ Reset layout
          </button>
        </div>
      ) : null}
    </div>
  );
}
