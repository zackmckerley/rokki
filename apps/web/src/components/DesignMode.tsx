"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

/**
 * Design Mode v2 — sandbox-only live tuner for the design system.
 *
 * Press Shift+D (or click the "✦ Design" pill) on any non-production host
 * and a panel slides in over the REAL app. Every slider / swatch / select
 * writes a CSS custom property (or attribute) onto <html> at runtime, so
 * the actual UI restyles live — no mock, no deploy.
 *
 * v2 expands coverage from ~18 knobs to ~50:
 *   - Type: all 8 font sizes (2xs..2xl) + 5 leading tiers + font family
 *   - Color: 5 bg + 5 text + 3 border + 4 accent + 8 semantic = 25 swatches
 *   - Layout: card header h, row py, ctrl py, search h, section head h,
 *             card radius, topbar h, ticker h
 *   - Rail: header h, item indent, terminal indent
 *
 * Plus in-panel features:
 *   - Search/filter (find any knob fast)
 *   - Collapsible groups
 *   - "Show only changed" toggle (great for review before Export)
 *   - Export copies a diff to the clipboard ready to paste back to Claude
 *
 * Tweaks persist per-browser. The panel never renders on rokki.ai /
 * www.rokki.ai — only mutates inline CSS variables — no app state, no
 * data, no DOM moves.
 */

type Knob =
  | {
      id: string;
      label: string;
      group: string;
      kind: "range";
      min: number;
      max: number;
      step: number;
      unit: string;
    }
  | { id: string; label: string; group: string; kind: "color" }
  | {
      id: string;
      label: string;
      group: string;
      kind: "select";
      options: { value: string; label: string }[];
      /** Non-CSS-var setters (e.g. font family, theme attribute). */
      apply?: (v: string) => void;
      read?: () => string;
    };

const KNOBS: Knob[] = [
  // ---- Type — font size ----
  { id: "--text-2xs", label: "Meta (counts, chips, times)", group: "Type — font size", kind: "range", min: 8, max: 16, step: 1, unit: "px" },
  { id: "--text-xs", label: "Labels & nav", group: "Type — font size", kind: "range", min: 9, max: 18, step: 1, unit: "px" },
  { id: "--text-sm", label: "Content (titles, events)", group: "Type — font size", kind: "range", min: 10, max: 20, step: 1, unit: "px" },
  { id: "--text-base", label: "Base", group: "Type — font size", kind: "range", min: 12, max: 22, step: 1, unit: "px" },
  { id: "--text-md", label: "Medium", group: "Type — font size", kind: "range", min: 12, max: 24, step: 1, unit: "px" },
  { id: "--text-lg", label: "Large", group: "Type — font size", kind: "range", min: 14, max: 28, step: 1, unit: "px" },
  { id: "--text-xl", label: "Extra large", group: "Type — font size", kind: "range", min: 16, max: 36, step: 1, unit: "px" },
  { id: "--text-2xl", label: "2× extra large", group: "Type — font size", kind: "range", min: 18, max: 44, step: 1, unit: "px" },

  // ---- Type — leading (line height) ----
  { id: "--leading-2xs", label: "Meta line spacing", group: "Type — line spacing", kind: "range", min: 10, max: 22, step: 1, unit: "px" },
  { id: "--leading-xs", label: "Labels line spacing", group: "Type — line spacing", kind: "range", min: 11, max: 24, step: 1, unit: "px" },
  { id: "--leading-sm", label: "Content line spacing", group: "Type — line spacing", kind: "range", min: 12, max: 28, step: 1, unit: "px" },
  { id: "--leading-base", label: "Base line spacing", group: "Type — line spacing", kind: "range", min: 14, max: 30, step: 1, unit: "px" },
  { id: "--leading-md", label: "Medium line spacing", group: "Type — line spacing", kind: "range", min: 16, max: 32, step: 1, unit: "px" },

  // ---- Type — family ----
  {
    id: "font-family",
    label: "Font family",
    group: "Type — family",
    kind: "select",
    options: [
      { value: "geist", label: "Geist (default)" },
      { value: "system", label: "System UI" },
      { value: "serif", label: "Serif" },
      { value: "mono", label: "Geist Mono" },
    ],
    apply: (v) => {
      const map: Record<string, string> = {
        geist: '"Geist", ui-sans-serif, system-ui, -apple-system, sans-serif',
        system: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        serif: '"GT Sectra", "Source Serif Pro", Georgia, serif',
        mono: '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace',
      };
      document.documentElement.style.setProperty("--font-sans", map[v] ?? map.geist);
    },
    read: () => {
      const v = getComputedStyle(document.documentElement).getPropertyValue("--font-sans");
      if (v.includes("GT Sectra") || v.includes("Source Serif")) return "serif";
      if (v.includes("Geist Mono")) return "mono";
      if (v.includes("Geist")) return "geist";
      return "system";
    },
  },

  // ---- Color — text ----
  { id: "--text-0", label: "Text — brightest (the “white”)", group: "Color — text", kind: "color" },
  { id: "--text-1", label: "Text — bright (body/nav)", group: "Color — text", kind: "color" },
  { id: "--text-2", label: "Text — muted (titles/meta)", group: "Color — text", kind: "color" },
  { id: "--text-3", label: "Text — dim (timestamps)", group: "Color — text", kind: "color" },
  { id: "--text-disabled", label: "Text — disabled", group: "Color — text", kind: "color" },

  // ---- Color — backgrounds ----
  { id: "--bg-0", label: "Background — page", group: "Color — backgrounds", kind: "color" },
  { id: "--bg-1", label: "Background — cards", group: "Color — backgrounds", kind: "color" },
  { id: "--bg-2", label: "Background — hover", group: "Color — backgrounds", kind: "color" },
  { id: "--bg-3", label: "Background — pressed / chip", group: "Color — backgrounds", kind: "color" },
  { id: "--bg-4", label: "Background — emphasis", group: "Color — backgrounds", kind: "color" },

  // ---- Color — borders ----
  { id: "--border", label: "Border — soft", group: "Color — borders", kind: "color" },
  { id: "--border-strong", label: "Border — strong", group: "Color — borders", kind: "color" },
  { id: "--border-focus", label: "Border — focus ring", group: "Color — borders", kind: "color" },

  // ---- Color — accent ----
  { id: "--accent", label: "Accent", group: "Color — accent", kind: "color" },
  { id: "--accent-hover", label: "Accent — hover", group: "Color — accent", kind: "color" },
  { id: "--accent-active", label: "Accent — active", group: "Color — accent", kind: "color" },
  { id: "--accent-subtle", label: "Accent — subtle bg", group: "Color — accent", kind: "color" },

  // ---- Color — semantic ----
  { id: "--success", label: "Success", group: "Color — semantic", kind: "color" },
  { id: "--success-subtle", label: "Success — subtle bg", group: "Color — semantic", kind: "color" },
  { id: "--warning", label: "Warning", group: "Color — semantic", kind: "color" },
  { id: "--warning-subtle", label: "Warning — subtle bg", group: "Color — semantic", kind: "color" },
  { id: "--danger", label: "Danger", group: "Color — semantic", kind: "color" },
  { id: "--danger-subtle", label: "Danger — subtle bg", group: "Color — semantic", kind: "color" },
  { id: "--info", label: "Info", group: "Color — semantic", kind: "color" },
  { id: "--info-subtle", label: "Info — subtle bg", group: "Color — semantic", kind: "color" },

  // ---- Spacing & layout — cards / rows ----
  { id: "--rk-card-header-h", label: "Card header height", group: "Spacing — cards & rows", kind: "range", min: 24, max: 60, step: 1, unit: "px" },
  { id: "--rk-row-py", label: "Row vertical padding", group: "Spacing — cards & rows", kind: "range", min: 1, max: 16, step: 1, unit: "px" },
  { id: "--rk-ctrl-py", label: "Tasks controls-row padding", group: "Spacing — cards & rows", kind: "range", min: 1, max: 18, step: 1, unit: "px" },
  { id: "--rk-section-head-h", label: "Section header height", group: "Spacing — cards & rows", kind: "range", min: 20, max: 44, step: 1, unit: "px" },
  { id: "--rk-card-radius", label: "Card corner radius", group: "Spacing — cards & rows", kind: "range", min: 0, max: 16, step: 1, unit: "px" },

  // ---- Spacing & layout — top chrome ----
  { id: "--rk-topbar-h", label: "Top bar height", group: "Spacing — top chrome", kind: "range", min: 36, max: 64, step: 1, unit: "px" },
  { id: "--rk-ticker-h", label: "Ticker tape height", group: "Spacing — top chrome", kind: "range", min: 24, max: 52, step: 1, unit: "px" },

  // ---- Explorer rail ----
  { id: "--rk-rail-header-h", label: "Rail header height", group: "Explorer rail", kind: "range", min: 24, max: 56, step: 1, unit: "px" },
  { id: "--rk-search-h", label: "Search box height", group: "Explorer rail", kind: "range", min: 24, max: 44, step: 1, unit: "px" },
  { id: "--rk-rail-indent", label: "Item indent", group: "Explorer rail", kind: "range", min: 0, max: 28, step: 1, unit: "px" },
  { id: "--rk-rail-indent-child", label: "Terminal indent", group: "Explorer rail", kind: "range", min: 8, max: 56, step: 1, unit: "px" },
];

const GROUPS = Array.from(new Set(KNOBS.map((k) => k.group)));
const STORE = "rokki:design-mode";
const STORE_UI = "rokki:design-mode-ui";

function isProdHost(h: string) {
  return h === "rokki.ai" || h === "www.rokki.ai";
}
function norm(s: string) {
  return s.replace(/\s+/g, "").toLowerCase();
}
function toHex(v: string): string {
  const t = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(t)) {
    return ("#" + t.slice(1).split("").map((c) => c + c).join("")).toLowerCase();
  }
  const m = t.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const [r, g, b] = m[1].split(",").map((x) => parseInt(x.trim(), 10));
    return (
      "#" +
      [r, g, b].map((n) => Math.max(0, Math.min(255, n || 0)).toString(16).padStart(2, "0")).join("")
    );
  }
  return "#000000";
}
function themeTargets(): HTMLElement[] {
  const out: HTMLElement[] = [document.documentElement];
  document.querySelectorAll<HTMLElement>("[data-theme]").forEach((el) => {
    if (el !== document.documentElement) out.push(el);
  });
  return out;
}
function setCssVar(id: string, value: string) {
  themeTargets().forEach((el) => el.style.setProperty(id, value));
}
function clearCssVar(id: string) {
  themeTargets().forEach((el) => el.style.removeProperty(id));
}

export function DesignMode() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);

  // Per-knob input values: numeric string for range, hex for color, raw value for select.
  const [vals, setVals] = useState<Record<string, string>>({});
  // Per-knob baseline (computed from CSS at first mount). The diff vs. baseline is what Export produces.
  const baseline = useRef<Record<string, string>>({});

  // Panel UI state — persisted so the user keeps their layout between visits.
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [exported, setExported] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"" | "copied" | "fallback">("");

  useEffect(() => {
    if (isProdHost(window.location.hostname)) return;
    setEnabled(true);

    // 1. Read baseline values from CSS + the special select knobs' readers.
    const cs = getComputedStyle(document.documentElement);
    const base: Record<string, string> = {};
    const init: Record<string, string> = {};
    for (const k of KNOBS) {
      let raw = "";
      if (k.kind === "select") raw = k.read ? k.read() : "";
      else raw = cs.getPropertyValue(k.id).trim();
      base[k.id] = raw;
      if (k.kind === "color") init[k.id] = toHex(raw);
      else if (k.kind === "range") init[k.id] = String(parseFloat(raw) || k.min);
      else init[k.id] = raw;
    }
    baseline.current = base;

    // 2. Replay any persisted overrides onto the page + into `init`.
    let stored: Record<string, string> = {};
    try {
      stored = JSON.parse(localStorage.getItem(STORE) || "{}") as Record<string, string>;
    } catch {
      stored = {};
    }
    for (const k of KNOBS) {
      if (!stored[k.id]) continue;
      if (k.kind === "select") {
        init[k.id] = stored[k.id];
        k.apply?.(stored[k.id]);
      } else if (k.kind === "color") {
        init[k.id] = toHex(stored[k.id]);
        setCssVar(k.id, stored[k.id]);
      } else {
        init[k.id] = String(parseFloat(stored[k.id]) || init[k.id]);
        setCssVar(k.id, stored[k.id]);
      }
    }
    setVals(init);

    // 3. UI state (groups collapsed, only-changed) persisted alongside.
    try {
      const ui = JSON.parse(localStorage.getItem(STORE_UI) || "{}") as {
        collapsed?: Record<string, boolean>;
        onlyChanged?: boolean;
      };
      if (ui.collapsed) setCollapsed(ui.collapsed);
      if (typeof ui.onlyChanged === "boolean") setOnlyChanged(ui.onlyChanged);
    } catch {
      /* defaults */
    }

    // 4. Shift+D toggles the panel. Don't steal it while the user is typing.
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "d" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) {
        return;
      }
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_UI, JSON.stringify({ collapsed, onlyChanged }));
    } catch {
      /* ignore */
    }
  }, [collapsed, onlyChanged]);

  function cssValue(k: Knob, input: string) {
    if (k.kind === "color") return input;
    if (k.kind === "range") return input + k.unit;
    return input;
  }
  function persist(next: Record<string, string>) {
    const map: Record<string, string> = {};
    for (const k of KNOBS) {
      const cv = cssValue(k, next[k.id] ?? "");
      const base = baseline.current[k.id] ?? "";
      if (norm(cv) !== norm(base) && next[k.id]) map[k.id] = cv;
    }
    try {
      localStorage.setItem(STORE, JSON.stringify(map));
    } catch {
      /* quota / private mode */
    }
  }
  function update(k: Knob, input: string) {
    setVals((v) => {
      const next = { ...v, [k.id]: input };
      if (k.kind === "select") k.apply?.(input);
      else setCssVar(k.id, cssValue(k, input));
      persist(next);
      return next;
    });
    setExported(null);
  }
  function resetAll() {
    for (const k of KNOBS) {
      if (k.kind === "select") k.apply?.(k.read ? k.read() : "");
      else clearCssVar(k.id);
    }
    try {
      localStorage.removeItem(STORE);
    } catch {
      /* ignore */
    }
    // Re-read everything from CSS so the inputs land on the true baseline.
    const cs = getComputedStyle(document.documentElement);
    const init: Record<string, string> = {};
    for (const k of KNOBS) {
      let raw = "";
      if (k.kind === "select") raw = k.read ? k.read() : "";
      else raw = cs.getPropertyValue(k.id).trim();
      baseline.current[k.id] = raw;
      if (k.kind === "color") init[k.id] = toHex(raw);
      else if (k.kind === "range") init[k.id] = String(parseFloat(raw) || k.min);
      else init[k.id] = raw;
    }
    setVals(init);
    setExported(null);
  }
  function resetGroup(group: string) {
    const next = { ...vals };
    for (const k of KNOBS) {
      if (k.group !== group) continue;
      if (k.kind === "select") k.apply?.(baseline.current[k.id] ?? "");
      else clearCssVar(k.id);
      const raw = baseline.current[k.id] ?? "";
      if (k.kind === "color") next[k.id] = toHex(raw);
      else if (k.kind === "range") next[k.id] = String(parseFloat(raw) || k.min);
      else next[k.id] = raw;
    }
    setVals(next);
    persist(next);
    setExported(null);
  }
  function doExport() {
    const changed: string[] = [];
    for (const k of KNOBS) {
      const cv = cssValue(k, vals[k.id] ?? "");
      const base = baseline.current[k.id] ?? "";
      if (norm(cv) !== norm(base) && vals[k.id]) {
        changed.push(`  ${k.id}: ${cv}   (was ${base || "—"})  — ${k.label}`);
      }
    }
    const text = changed.length
      ? `ROKKI DESIGN MODE — apply these (${changed.length} changed):\n\n${changed.join("\n")}`
      : "No changes yet — everything matches the current app.";
    setExported(text);
    setCopyState("");
    navigator.clipboard
      ?.writeText(text)
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("fallback"));
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return KNOBS.filter((k) => {
      if (q) {
        const hay = (k.label + " " + k.id + " " + k.group).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (onlyChanged) {
        const cv = cssValue(k, vals[k.id] ?? "");
        const base = baseline.current[k.id] ?? "";
        if (norm(cv) === norm(base)) return false;
      }
      return true;
    });
  }, [query, onlyChanged, vals]);

  const changedCount = useMemo(() => {
    let c = 0;
    for (const k of KNOBS) {
      const cv = cssValue(k, vals[k.id] ?? "");
      const base = baseline.current[k.id] ?? "";
      if (norm(cv) !== norm(base) && vals[k.id]) c++;
    }
    return c;
  }, [vals]);

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Design Mode (Shift+D)"
        style={S.launcher}
      >
        ✦ Design{changedCount ? <span style={S.badge}>{changedCount}</span> : null}
      </button>

      {open ? (
        <aside style={S.panel} aria-label="Design Mode">
          <div style={S.head}>
            <div>
              <div style={S.title}>Design Mode <span style={S.v2}>v2</span></div>
              <div style={S.sub}>
                Sandbox only · live · ⇧D to toggle · {changedCount} changed
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={S.x} aria-label="Close">
              ✕
            </button>
          </div>

          <div style={S.actions}>
            <button type="button" onClick={doExport} style={{ ...S.btn, ...S.primary }}>
              Export ↗
            </button>
            <button type="button" onClick={resetAll} style={S.btn}>
              Reset all
            </button>
          </div>

          <div style={S.filterRow}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a knob…  (e.g. row, color, header)"
              style={S.search}
              spellCheck={false}
            />
            <label style={S.checkRow}>
              <input
                type="checkbox"
                checked={onlyChanged}
                onChange={(e) => setOnlyChanged(e.target.checked)}
              />
              <span>Only changed</span>
            </label>
          </div>

          {exported ? (
            <div style={S.exportBox}>
              <div style={S.exportNote}>
                {copyState === "copied"
                  ? "Copied to clipboard ✓ — paste it to Claude."
                  : copyState === "fallback"
                    ? "Select all and copy — paste it to Claude."
                    : "Ready — copying…"}
              </div>
              <textarea
                readOnly
                value={exported}
                style={S.textarea}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          ) : null}

          <div style={S.scroll}>
            {GROUPS.map((g) => {
              const items = visible.filter((k) => k.group === g);
              if (!items.length) return null;
              const isCollapsed = collapsed[g] === true;
              return (
                <div key={g} style={S.group}>
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [g]: !isCollapsed }))}
                    style={S.groupTitle}
                  >
                    <span>{isCollapsed ? "▸" : "▾"} {g}</span>
                    <span style={S.groupActions}>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          resetGroup(g);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            resetGroup(g);
                          }
                        }}
                        style={S.groupReset}
                        title={`Reset ${g}`}
                      >
                        reset
                      </span>
                    </span>
                  </button>
                  {isCollapsed ? null : items.map((k) => (
                    <div key={k.id} style={S.knob}>
                      {k.kind === "color" ? (
                        <>
                          <div style={S.labRow}>
                            <span style={S.lab}>{k.label}</span>
                          </div>
                          <div style={S.colorRow}>
                            <input
                              type="color"
                              value={vals[k.id] ?? "#000000"}
                              onChange={(e) => update(k, e.target.value)}
                              style={S.colorPick}
                            />
                            <input
                              type="text"
                              value={vals[k.id] ?? ""}
                              onChange={(e) => {
                                const t = e.target.value;
                                if (/^#[0-9a-fA-F]{6}$/.test(t)) update(k, t.toLowerCase());
                                else setVals((v) => ({ ...v, [k.id]: t }));
                              }}
                              style={S.hex}
                              spellCheck={false}
                            />
                          </div>
                        </>
                      ) : k.kind === "select" ? (
                        <>
                          <div style={S.labRow}>
                            <span style={S.lab}>{k.label}</span>
                          </div>
                          <select
                            value={vals[k.id] ?? ""}
                            onChange={(e) => update(k, e.target.value)}
                            style={S.select}
                          >
                            {k.options.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <>
                          <div style={S.labRow}>
                            <span style={S.lab}>{k.label}</span>
                            <span style={S.val}>
                              {vals[k.id]}
                              {k.unit}
                            </span>
                          </div>
                          <input
                            type="range"
                            min={k.min}
                            max={k.max}
                            step={k.step}
                            value={vals[k.id] ?? k.min}
                            onChange={(e) => update(k, e.target.value)}
                            style={S.range}
                          />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
            {visible.length === 0 ? (
              <div style={S.empty}>
                No knobs match{" "}
                <span style={{ color: "#f5a623" }}>“{query}”</span>
                {onlyChanged ? " in the changed set." : "."}
              </div>
            ) : null}
            <div style={S.footer}>
              Changes save in this browser only, never touch production. Hit{" "}
              <strong style={{ color: "#e6e6ea" }}>Export</strong> when you like the look — paste it
              to Claude and it gets baked into the app.
            </div>
          </div>
        </aside>
      ) : null}
    </>
  );
}

/* Inline styles with literal colors so the panel stays readable no matter
   what you do to the app's tokens. */
const S: Record<string, CSSProperties> = {
  launcher: {
    position: "fixed",
    right: 12,
    bottom: 12,
    zIndex: 2147483000,
    background: "#1a1a1d",
    color: "#e6e6ea",
    border: "1px solid #34343b",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    cursor: "pointer",
    boxShadow: "0 4px 14px rgba(0,0,0,.4)",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  badge: {
    background: "#f5a623",
    color: "#0a0a0b",
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 6px",
  },
  panel: {
    position: "fixed",
    top: 0,
    right: 0,
    height: "100vh",
    width: 360,
    maxWidth: "95vw",
    zIndex: 2147483001,
    background: "#0f0f11",
    borderLeft: "1px solid #2a2a2f",
    color: "#e6e6ea",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontSize: 13,
    display: "flex",
    flexDirection: "column",
    boxShadow: "-12px 0 32px rgba(0,0,0,.45)",
  },
  head: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: "12px 14px 8px",
    borderBottom: "1px solid #1c1c20",
  },
  title: { fontSize: 14, fontWeight: 700 },
  v2: {
    fontSize: 10,
    fontWeight: 600,
    background: "#3d2e14",
    color: "#f5a623",
    padding: "1px 5px",
    borderRadius: 3,
    marginLeft: 6,
    verticalAlign: 1,
  },
  sub: { fontSize: 11, color: "#8a8a92", marginTop: 2 },
  x: { background: "none", border: "none", color: "#8a8a92", fontSize: 16, cursor: "pointer", lineHeight: 1 },
  actions: { display: "flex", gap: 8, padding: "10px 14px", borderBottom: "1px solid #1c1c20" },
  btn: {
    flex: 1,
    cursor: "pointer",
    border: "1px solid #34343b",
    background: "#1a1a1d",
    color: "#e6e6ea",
    borderRadius: 5,
    padding: "7px 8px",
    fontSize: 12,
    fontWeight: 600,
  },
  primary: { background: "#f5a623", borderColor: "#f5a623", color: "#0a0a0b" },
  filterRow: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "10px 14px",
    borderBottom: "1px solid #1c1c20",
  },
  search: {
    width: "100%",
    background: "#16161a",
    border: "1px solid #34343b",
    color: "#e6e6ea",
    borderRadius: 5,
    padding: "6px 9px",
    fontSize: 12,
    fontFamily: "inherit",
  },
  checkRow: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 12,
    color: "#cdd0d6",
    cursor: "pointer",
    userSelect: "none",
  },
  exportBox: { padding: "10px 14px", borderBottom: "1px solid #1c1c20" },
  exportNote: { fontSize: 11.5, color: "#9aa0aa", marginBottom: 6 },
  textarea: {
    width: "100%",
    height: 130,
    background: "#0a0a0b",
    border: "1px solid #2a2a2f",
    borderRadius: 6,
    color: "#d6d6da",
    fontFamily: "ui-monospace, monospace",
    fontSize: 11.5,
    lineHeight: 1.5,
    padding: 8,
    resize: "vertical" as const,
  },
  scroll: { flex: 1, overflow: "auto", padding: "0 14px 24px" },
  group: { padding: "4px 0 8px", borderBottom: "1px solid #161619" },
  groupTitle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    margin: "12px 0 8px",
    padding: "4px 0",
    background: "none",
    border: "none",
    color: "#cdd0d6",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: ".08em",
    textAlign: "left" as const,
  },
  groupActions: { display: "inline-flex", alignItems: "center", gap: 6 },
  groupReset: {
    fontSize: 10,
    fontWeight: 600,
    color: "#8a8a92",
    background: "#1a1a1d",
    border: "1px solid #2a2a2f",
    borderRadius: 3,
    padding: "1px 6px",
    cursor: "pointer",
    textTransform: "none" as const,
    letterSpacing: 0,
  },
  knob: { margin: "9px 0" },
  labRow: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 },
  lab: { fontSize: 12, color: "#cdd0d6" },
  val: { fontFamily: "ui-monospace, monospace", fontSize: 11, color: "#f5a623" },
  range: { width: "100%", accentColor: "#f5a623", height: 18 },
  colorRow: { display: "flex", alignItems: "center", gap: 8 },
  colorPick: {
    width: 34,
    height: 24,
    padding: 0,
    border: "1px solid #34343b",
    borderRadius: 4,
    background: "none",
    cursor: "pointer",
  },
  hex: {
    flex: 1,
    background: "#16161a",
    border: "1px solid #34343b",
    color: "#e6e6ea",
    borderRadius: 4,
    padding: "5px 7px",
    fontFamily: "ui-monospace, monospace",
    fontSize: 11,
  },
  select: {
    width: "100%",
    background: "#16161a",
    border: "1px solid #34343b",
    color: "#e6e6ea",
    borderRadius: 4,
    padding: "5px 7px",
    fontSize: 12,
    fontFamily: "inherit",
  },
  empty: { padding: "16px 0", fontSize: 12, color: "#8a8a92" },
  footer: { fontSize: 11, color: "#6f7078", lineHeight: 1.5, paddingTop: 14 },
};
