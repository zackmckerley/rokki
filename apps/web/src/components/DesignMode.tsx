"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Design Mode — a sandbox-only live tuner for the design system.
 *
 * Press Shift+D (or click the corner pill) on any non-production host and a
 * panel slides in over the REAL app. Every slider / swatch writes a CSS
 * custom property onto <html> at runtime, so the actual dashboard restyles
 * live — no mock, no deploy. Tweaks persist per-browser (localStorage) and
 * Export copies a summary of everything you changed so it can be baked into
 * the codebase permanently.
 *
 * It never renders on the production apex (rokki.ai / www.rokki.ai), and it
 * only mutates inline CSS variables — it touches no app state or data.
 *
 * The two var families it drives:
 *   - existing design tokens: --text-0..3, --border, --border-strong,
 *     --accent, --text-2xs..base, --leading-sm   (defined in globals.css)
 *   - layout knobs: --rk-card-header-h, --rk-row-py, --rk-ctrl-py,
 *     --rk-rail-header-h, --rk-rail-indent, --rk-rail-indent-child
 *     (also in globals.css; consumed via Tailwind h-[var(...)] etc.)
 */

type Knob =
  | {
      id: string;
      label: string;
      kind: "range";
      min: number;
      max: number;
      step: number;
      unit: string;
    }
  | { id: string; label: string; kind: "color" };

const GROUPS: { title: string; knobs: Knob[] }[] = [
  {
    title: "Type — font size",
    knobs: [
      { id: "--text-2xs", label: "Meta (counts, chips, times)", kind: "range", min: 8, max: 14, step: 1, unit: "px" },
      { id: "--text-xs", label: "Labels & nav", kind: "range", min: 9, max: 16, step: 1, unit: "px" },
      { id: "--text-sm", label: "Content (titles, events)", kind: "range", min: 11, max: 18, step: 1, unit: "px" },
      { id: "--text-base", label: "Base", kind: "range", min: 12, max: 20, step: 1, unit: "px" },
      { id: "--leading-sm", label: "Content line spacing", kind: "range", min: 14, max: 28, step: 1, unit: "px" },
    ],
  },
  {
    title: "Color",
    knobs: [
      { id: "--text-0", label: "Text — brightest (the “white”)", kind: "color" },
      { id: "--text-1", label: "Text — bright (body/nav)", kind: "color" },
      { id: "--text-2", label: "Text — muted (titles/meta)", kind: "color" },
      { id: "--text-3", label: "Text — dim (timestamps)", kind: "color" },
      { id: "--border", label: "Border — soft (dividers)", kind: "color" },
      { id: "--border-strong", label: "Border — strong (cards)", kind: "color" },
      { id: "--accent", label: "Accent", kind: "color" },
    ],
  },
  {
    title: "Spacing & layout",
    knobs: [
      { id: "--rk-card-header-h", label: "Card header height", kind: "range", min: 28, max: 56, step: 1, unit: "px" },
      { id: "--rk-row-py", label: "Row vertical padding", kind: "range", min: 2, max: 14, step: 1, unit: "px" },
      { id: "--rk-ctrl-py", label: "Tasks controls-row padding", kind: "range", min: 2, max: 16, step: 1, unit: "px" },
    ],
  },
  {
    title: "Explorer rail",
    knobs: [
      { id: "--rk-rail-header-h", label: "Rail header height", kind: "range", min: 28, max: 56, step: 1, unit: "px" },
      { id: "--rk-rail-indent", label: "Item indent", kind: "range", min: 0, max: 28, step: 1, unit: "px" },
      { id: "--rk-rail-indent-child", label: "Terminal indent", kind: "range", min: 8, max: 48, step: 1, unit: "px" },
    ],
  },
];

const ALL: Knob[] = GROUPS.flatMap((g) => g.knobs);
const STORE = "rokki:design-mode";

function isProdHost(h: string) {
  return h === "rokki.ai" || h === "www.rokki.ai";
}
function norm(s: string) {
  return s.replace(/\s+/g, "").toLowerCase();
}
function toHex(v: string): string {
  const t = v.trim();
  if (/^#[0-9a-f]{6}$/i.test(t)) return t.toLowerCase();
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
function setVar(id: string, value: string) {
  themeTargets().forEach((el) => el.style.setProperty(id, value));
}
function clearVar(id: string) {
  themeTargets().forEach((el) => el.style.removeProperty(id));
}

export function DesignMode() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  // `vals` holds the input value for each knob: a number-as-string for
  // ranges, a hex string for colors.
  const [vals, setVals] = useState<Record<string, string>>({});
  const baseline = useRef<Record<string, string>>({});
  const [exported, setExported] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isProdHost(window.location.hostname)) return;
    setEnabled(true);

    const cs = getComputedStyle(document.documentElement);
    const base: Record<string, string> = {};
    const init: Record<string, string> = {};
    let stored: Record<string, string> = {};
    try {
      stored = JSON.parse(localStorage.getItem(STORE) || "{}") as Record<string, string>;
    } catch {
      stored = {};
    }
    for (const k of ALL) {
      const raw = cs.getPropertyValue(k.id).trim();
      base[k.id] = raw;
      const current = stored[k.id] ?? raw;
      init[k.id] = k.kind === "color" ? toHex(current) : String(parseFloat(current) || 0);
      if (stored[k.id]) setVar(k.id, stored[k.id]);
    }
    baseline.current = base;
    setVals(init);

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

  function cssValue(k: Knob, input: string) {
    return k.kind === "color" ? input : input + k.unit;
  }
  function persist(next: Record<string, string>) {
    const map: Record<string, string> = {};
    for (const k of ALL) {
      const cv = cssValue(k, next[k.id]);
      if (norm(cv) !== norm(baseline.current[k.id] ?? "")) map[k.id] = cv;
    }
    try {
      localStorage.setItem(STORE, JSON.stringify(map));
    } catch {
      /* ignore quota / privacy mode */
    }
  }
  function update(k: Knob, input: string) {
    setVals((v) => {
      const next = { ...v, [k.id]: input };
      setVar(k.id, cssValue(k, input));
      persist(next);
      return next;
    });
    setExported(null);
  }
  function reset() {
    for (const k of ALL) clearVar(k.id);
    try {
      localStorage.removeItem(STORE);
    } catch {
      /* ignore */
    }
    const init: Record<string, string> = {};
    for (const k of ALL) {
      const raw = baseline.current[k.id] ?? "";
      init[k.id] = k.kind === "color" ? toHex(raw) : String(parseFloat(raw) || 0);
    }
    setVals(init);
    setExported(null);
  }
  function doExport() {
    const changed: string[] = [];
    for (const k of ALL) {
      const cv = cssValue(k, vals[k.id] ?? "");
      const base = baseline.current[k.id] ?? "";
      if (norm(cv) !== norm(base)) changed.push(`  ${k.id}: ${cv}   (was ${base})  — ${k.label}`);
    }
    const text = changed.length
      ? `ROKKI DESIGN MODE — apply these (${changed.length} changed):\n\n${changed.join("\n")}`
      : "No changes yet — everything matches the current app.";
    setExported(text);
    setCopied(false);
    navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  if (!enabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Design Mode (Shift+D)"
        style={S.launcher}
      >
        ✦ Design
      </button>

      {open ? (
        <aside style={S.panel} aria-label="Design Mode">
          <div style={S.head}>
            <div>
              <div style={S.title}>Design Mode</div>
              <div style={S.sub}>Sandbox only · live · ⇧D to toggle</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={S.x} aria-label="Close">
              ✕
            </button>
          </div>

          <div style={S.actions}>
            <button type="button" onClick={doExport} style={{ ...S.btn, ...S.primary }}>
              Export ↗
            </button>
            <button type="button" onClick={reset} style={S.btn}>
              Reset
            </button>
          </div>

          {exported ? (
            <div style={S.exportBox}>
              <div style={S.exportNote}>
                {copied ? "Copied to clipboard ✓ — paste it to Claude." : "Select all and copy — paste it to Claude."}
              </div>
              <textarea readOnly value={exported} style={S.textarea} onFocus={(e) => e.currentTarget.select()} />
            </div>
          ) : null}

          <div style={S.scroll}>
            {GROUPS.map((g) => (
              <div key={g.title} style={S.group}>
                <div style={S.groupTitle}>{g.title}</div>
                {g.knobs.map((k) => (
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
            ))}
            <div style={S.footer}>
              Changes are saved in this browser only and never touch production. Hit Export when you like it.
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
  },
  panel: {
    position: "fixed",
    top: 0,
    right: 0,
    height: "100vh",
    width: 348,
    maxWidth: "92vw",
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
  exportBox: { padding: "10px 14px", borderBottom: "1px solid #1c1c20" },
  exportNote: { fontSize: 11.5, color: "#9aa0aa", marginBottom: 6 },
  textarea: {
    width: "100%",
    height: 120,
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
    margin: "12px 0 8px",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: ".08em",
    color: "#8a8a92",
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
  footer: { fontSize: 11, color: "#6f7078", lineHeight: 1.5, paddingTop: 14 },
};
