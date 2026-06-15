"use client";

import { useEffect, useRef, useState } from "react";
import {
  Settings,
  ChevronUp,
  ChevronDown,
  EyeOff,
  Plus,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useModulePrefs } from "./module-visibility";
import {
  isOpenByDefault,
  LAYOUT_PRESETS,
  type DashLayoutPreset,
} from "@/lib/module-prefs";

const LAYOUT_LABELS: Record<DashLayoutPreset, string> = {
  stacked: "Stacked",
  split: "Split",
};

/**
 * The gear on the explorer rail's MODULES header → a popover of per-user
 * settings for the whole module shelf (settings #1-8). Renders nothing when
 * there's no ModulePrefs provider (e.g. the rail inside a terminal), so the
 * gear only appears where modules actually live — the dashboard.
 */
export function ModuleSettings() {
  const ctx = useModulePrefs();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!ctx) return null;

  const {
    prefs,
    visibleModules,
    hiddenModules,
    moveBy,
    setOpenByDefault,
    setHidden,
    setLayout,
    setSectionCollapsed,
    setSync,
    reset,
  } = ctx;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Module settings"
        title="Module settings"
        className={cn(
          "rounded-sm p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
          open && "bg-bg-3 text-text-1",
        )}
      >
        <Settings className="h-3 w-3" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Module settings"
          className="absolute right-0 z-30 mt-1 w-64 rounded-md border border-border bg-bg-1 py-2 text-xs shadow-lg shadow-black/30"
        >
          {/* ---- Modules: show/hide (#1/#8), reorder (#2), open default (#3) ---- */}
          <SectionLabel>Modules</SectionLabel>
          <ul className="px-1">
            {visibleModules.map((m, i) => {
              const openByDefault = isOpenByDefault(prefs, m.id);
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-bg-2"
                >
                  <span className="flex flex-shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => moveBy(m.id, -1)}
                      disabled={i === 0}
                      aria-label={`Move ${m.label} up`}
                      className="text-text-3 hover:text-text-0 disabled:opacity-30"
                    >
                      <ChevronUp className="h-2.5 w-2.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBy(m.id, 1)}
                      disabled={i === visibleModules.length - 1}
                      aria-label={`Move ${m.label} down`}
                      className="text-text-3 hover:text-text-0 disabled:opacity-30"
                    >
                      <ChevronDown className="h-2.5 w-2.5" aria-hidden="true" />
                    </button>
                  </span>
                  <span className="flex-1 truncate text-text-1">{m.label}</span>
                  <label
                    className="flex flex-shrink-0 items-center gap-1 text-2xs text-text-3"
                    title="Open this module on load (uncheck to start minimized)"
                  >
                    <input
                      type="checkbox"
                      checked={openByDefault}
                      onChange={(e) => setOpenByDefault(m.id, e.target.checked)}
                      aria-label={`Open ${m.label} by default`}
                      className="h-3 w-3 accent-accent"
                    />
                    open
                  </label>
                  <button
                    type="button"
                    onClick={() => setHidden(m.id, true)}
                    aria-label={`Hide ${m.label}`}
                    title="Hide this module"
                    className="rounded-sm p-0.5 text-text-3 hover:bg-bg-3 hover:text-danger"
                  >
                    <EyeOff className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
            {visibleModules.length === 0 ? (
              <li className="px-1 py-1 text-2xs text-text-3">
                All modules hidden.
              </li>
            ) : null}
          </ul>

          {/* ---- Hidden tray — add back (#8) ---- */}
          {hiddenModules.length > 0 ? (
            <>
              <SectionLabel>Hidden</SectionLabel>
              <ul className="px-1">
                {hiddenModules.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center gap-1 rounded-sm px-1 py-0.5 hover:bg-bg-2"
                  >
                    <span className="flex-1 truncate text-text-3">{m.label}</span>
                    <button
                      type="button"
                      onClick={() => setHidden(m.id, false)}
                      aria-label={`Show ${m.label}`}
                      title="Add back to the shelf"
                      className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-2xs text-text-2 hover:bg-bg-3 hover:text-text-0"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" /> Add
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <Divider />

          {/* ---- Layout (#5) ---- */}
          <SectionLabel>Layout</SectionLabel>
          <div
            role="group"
            aria-label="Default layout"
            className="flex gap-1 px-2 pb-1"
          >
            {LAYOUT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setLayout(preset)}
                aria-pressed={prefs.layout === preset}
                className={cn(
                  "flex-1 rounded-sm border px-2 py-1 font-mono text-2xs uppercase tracking-wide",
                  prefs.layout === preset
                    ? "border-accent/50 bg-accent-subtle text-accent"
                    : "border-border bg-bg-1 text-text-3 hover:bg-bg-2 hover:text-text-1",
                )}
              >
                {LAYOUT_LABELS[preset]}
              </button>
            ))}
          </div>

          <Divider />

          {/* ---- Behavior (#6) + Sync (#7) ---- */}
          <ToggleRow
            label="Collapse on load"
            title="Start the MODULES section collapsed"
            checked={prefs.sectionCollapsed}
            onChange={(v) => setSectionCollapsed(v)}
          />
          <ToggleRow
            label="Sync across devices"
            title="Save these settings to your account so they follow you to other devices"
            checked={prefs.sync}
            onChange={(v) => setSync(v)}
          />

          <Divider />

          {/* ---- Reset (#4) ---- */}
          <div className="px-2 pt-1">
            <button
              type="button"
              onClick={reset}
              className="flex w-full items-center justify-center gap-1 rounded-sm border border-border bg-bg-1 px-2 py-1 font-mono text-2xs uppercase tracking-wide text-text-3 hover:bg-bg-2 hover:text-text-1"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" /> Reset modules
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-0.5 pt-1 font-mono text-[10px] uppercase tracking-wide text-text-3">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="my-1 border-t border-border" aria-hidden="true" />;
}

function ToggleRow({
  label,
  title,
  checked,
  onChange,
}: {
  label: string;
  title: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      title={title}
      className="flex cursor-pointer items-center gap-2 px-2 py-1 hover:bg-bg-2"
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="h-3 w-3 accent-accent"
      />
      <span className="text-text-1">{label}</span>
    </label>
  );
}
