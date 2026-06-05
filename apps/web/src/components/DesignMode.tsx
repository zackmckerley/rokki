"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

/**
 * Design Mode v2.1 — sandbox-only live tuner for the design system.
 *
 * Press Shift+D (or click the "✦ Design" pill) on any non-production host
 * and a panel slides in over the REAL app. Every slider / swatch / select
 * writes a CSS custom property into an injected stylesheet at runtime, so
 * the actual UI restyles live — no mock, no deploy.
 *
 * Theme scoping (the bug fix from v2.0):
 *   The old version wrote `documentElement.style.setProperty()` — inline
 *   styles which override BOTH theme rules. So a dark-mode tweak bled
 *   into light mode. v2.1 instead maintains an injected `<style id=
 *   "rokki-design-mode-overrides">` element in `<head>` with three
 *   scoped blocks:
 *      :root { ... shared (non-themed) overrides ... }
 *      :root, [data-theme="dark"] { ... dark-only overrides ... }
 *      [data-theme="light"] { ... light-only overrides ... }
 *   Color knobs are theme-scoped (write to dark / light). Type and layout
 *   knobs are shared (write to :root) — geometry and font sizes don't
 *   usually differ by theme. A MutationObserver on the html `data-theme`
 *   attribute resets the panel's inputs when the user flips themes.
 *
 *   Persistence schema is bumped to v2 ({ _root, dark, light }) with a
 *   one-time migration from the legacy flat map. Stored values that
 *   already match the baseline are dropped on migration so we don't
 *   carry redundant overrides.
 *
 * Safety: still sandbox-only — gates on hostname. Mutates a single
 * injected <style> element; no app state, no data, no DOM moves.
 */

type SelectOption = { value: string; label: string; cssValue: string };
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
      /** When true, write to the active theme's block; default false (shared). */
      themeScoped?: boolean;
    }
  | { id: string; label: string; group: string; kind: "color"; themeScoped?: boolean }
  | {
      id: string;
      label: string;
      group: string;
      kind: "select";
      options: SelectOption[];
      /** Map a raw CSS value back to a select option value (string match). */
      matchValue?: (raw: string) => string;
      themeScoped?: boolean;
    };

const KNOBS: Knob[] = [
  // ---- Type — font size (shared across themes) ----
  { id: "--text-2xs", label: "Meta (counts, chips, times)", group: "Type — font size", kind: "range", min: 8, max: 16, step: 1, unit: "px" },
  { id: "--text-xs", label: "Labels & nav", group: "Type — font size", kind: "range", min: 9, max: 18, step: 1, unit: "px" },
  { id: "--text-sm", label: "Content (titles, events)", group: "Type — font size", kind: "range", min: 10, max: 20, step: 1, unit: "px" },
  { id: "--text-base", label: "Base", group: "Type — font size", kind: "range", min: 12, max: 22, step: 1, unit: "px" },
  { id: "--text-md", label: "Medium", group: "Type — font size", kind: "range", min: 12, max: 24, step: 1, unit: "px" },
  { id: "--text-lg", label: "Large", group: "Type — font size", kind: "range", min: 14, max: 28, step: 1, unit: "px" },
  { id: "--text-xl", label: "Extra large", group: "Type — font size", kind: "range", min: 16, max: 36, step: 1, unit: "px" },
  { id: "--text-2xl", label: "2× extra large", group: "Type — font size", kind: "range", min: 18, max: 44, step: 1, unit: "px" },

  // ---- Type — line spacing (shared) ----
  { id: "--leading-2xs", label: "Meta line spacing", group: "Type — line spacing", kind: "range", min: 10, max: 22, step: 1, unit: "px" },
  { id: "--leading-xs", label: "Labels line spacing", group: "Type — line spacing", kind: "range", min: 11, max: 24, step: 1, unit: "px" },
  { id: "--leading-sm", label: "Content line spacing", group: "Type — line spacing", kind: "range", min: 12, max: 28, step: 1, unit: "px" },
  { id: "--leading-base", label: "Base line spacing", group: "Type — line spacing", kind: "range", min: 14, max: 30, step: 1, unit: "px" },
  { id: "--leading-md", label: "Medium line spacing", group: "Type — line spacing", kind: "range", min: 16, max: 32, step: 1, unit: "px" },

  // ---- Type — family (shared) ----
  {
    id: "--font-sans",
    label: "Font family",
    group: "Type — family",
    kind: "select",
    options: [
      { value: "geist", label: "Geist (default)", cssValue: '"Geist", ui-sans-serif, system-ui, -apple-system, sans-serif' },
      { value: "system", label: "System UI", cssValue: "ui-sans-serif, system-ui, -apple-system, sans-serif" },
      { value: "serif", label: "Serif", cssValue: '"GT Sectra", "Source Serif Pro", Georgia, serif' },
      { value: "mono", label: "Geist Mono", cssValue: '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace' },
    ],
    matchValue: (raw) => {
      if (raw.includes("GT Sectra") || raw.includes("Source Serif")) return "serif";
      if (raw.includes("Geist Mono")) return "mono";
      if (raw.includes("Geist")) return "geist";
      return "system";
    },
  },

  // ---- Color — text (THEMED) ----
  { id: "--text-0", label: "Text — brightest (the “white”)", group: "Color — text", kind: "color", themeScoped: true },
  { id: "--text-1", label: "Text — bright (body/nav)", group: "Color — text", kind: "color", themeScoped: true },
  { id: "--text-2", label: "Text — muted (titles/meta)", group: "Color — text", kind: "color", themeScoped: true },
  { id: "--text-3", label: "Text — dim (timestamps)", group: "Color — text", kind: "color", themeScoped: true },
  { id: "--text-disabled", label: "Text — disabled", group: "Color — text", kind: "color", themeScoped: true },

  // ---- Color — backgrounds (THEMED) ----
  { id: "--bg-0", label: "Background — page", group: "Color — backgrounds", kind: "color", themeScoped: true },
  { id: "--bg-1", label: "Background — cards", group: "Color — backgrounds", kind: "color", themeScoped: true },
  { id: "--bg-2", label: "Background — hover", group: "Color — backgrounds", kind: "color", themeScoped: true },
  { id: "--bg-3", label: "Background — pressed / chip", group: "Color — backgrounds", kind: "color", themeScoped: true },
  { id: "--bg-4", label: "Background — emphasis", group: "Color — backgrounds", kind: "color", themeScoped: true },

  // ---- Color — borders (THEMED) ----
  { id: "--border", label: "Border — soft", group: "Color — borders", kind: "color", themeScoped: true },
  { id: "--border-strong", label: "Border — strong", group: "Color — borders", kind: "color", themeScoped: true },
  { id: "--border-focus", label: "Border — focus ring", group: "Color — borders", kind: "color", themeScoped: true },

  // ---- Color — accent (THEMED) ----
  { id: "--accent", label: "Accent", group: "Color — accent", kind: "color", themeScoped: true },
  { id: "--accent-hover", label: "Accent — hover", group: "Color — accent", kind: "color", themeScoped: true },
  { id: "--accent-active", label: "Accent — active", group: "Color — accent", kind: "color", themeScoped: true },
  { id: "--accent-subtle", label: "Accent — subtle bg", group: "Color — accent", kind: "color", themeScoped: true },

  // ---- Color — semantic (THEMED) ----
  { id: "--success", label: "Success", group: "Color — semantic", kind: "color", themeScoped: true },
  { id: "--success-subtle", label: "Success — subtle bg", group: "Color — semantic", kind: "color", themeScoped: true },
  { id: "--warning", label: "Warning", group: "Color — semantic", kind: "color", themeScoped: true },
  { id: "--warning-subtle", label: "Warning — subtle bg", group: "Color — semantic", kind: "color", themeScoped: true },
  { id: "--danger", label: "Danger", group: "Color — semantic", kind: "color", themeScoped: true },
  { id: "--danger-subtle", label: "Danger — subtle bg", group: "Color — semantic", kind: "color", themeScoped: true },
  { id: "--info", label: "Info", group: "Color — semantic", kind: "color", themeScoped: true },
  { id: "--info-subtle", label: "Info — subtle bg", group: "Color — semantic", kind: "color", themeScoped: true },

  // ---- Spacing — cards & rows (shared) ----
  { id: "--rk-card-header-h", label: "Card header height", group: "Spacing — cards & rows", kind: "range", min: 24, max: 60, step: 1, unit: "px" },
  { id: "--rk-row-py", label: "Row vertical padding", group: "Spacing — cards & rows", kind: "range", min: 1, max: 16, step: 1, unit: "px" },
  { id: "--rk-ctrl-py", label: "Tasks controls-row padding", group: "Spacing — cards & rows", kind: "range", min: 1, max: 18, step: 1, unit: "px" },
  { id: "--rk-section-head-h", label: "Section header height", group: "Spacing — cards & rows", kind: "range", min: 20, max: 44, step: 1, unit: "px" },
  { id: "--rk-card-radius", label: "Card corner radius", group: "Spacing — cards & rows", kind: "range", min: 0, max: 16, step: 1, unit: "px" },

  // ---- Spacing — top chrome (shared) ----
  { id: "--rk-topbar-h", label: "Top bar height", group: "Spacing — top chrome", kind: "range", min: 36, max: 64, step: 1, unit: "px" },
  { id: "--rk-ticker-h", label: "Ticker tape height", group: "Spacing — top chrome", kind: "range", min: 24, max: 52, step: 1, unit: "px" },

  // ---- Explorer rail (shared) ----
  { id: "--rk-rail-header-h", label: "Rail header height", group: "Explorer rail", kind: "range", min: 24, max: 56, step: 1, unit: "px" },
  { id: "--rk-search-h", label: "Search box height", group: "Explorer rail", kind: "range", min: 24, max: 44, step: 1, unit: "px" },
  { id: "--rk-rail-indent", label: "Item indent", group: "Explorer rail", kind: "range", min: 0, max: 28, step: 1, unit: "px" },
  { id: "--rk-rail-indent-child", label: "Terminal indent", group: "Explorer rail", kind: "range", min: 8, max: 56, step: 1, unit: "px" },
];

const GROUPS = Array.from(new Set(KNOBS.map((k) => k.group)));

const STYLE_ID = "rokki-design-mode-overrides";
const STORE_V2 = "rokki:design-mode.v2";
const STORE_V1 = "rokki:design-mode";
const STORE_UI = "rokki:design-mode-ui";

type Theme = "dark" | "light";
type Prefs = {
  _root: Record<string, string>;
  dark: Record<string, string>;
  light: Record<string, string>;
};
function emptyPrefs(): Prefs {
  return { _root: {}, dark: {}, light: {} };
}

function isProdHost(h: string) {
  return h === "rokki.ai" || h === "www.rokki.ai";
}
function detectTheme(): Theme {
  const html = document.documentElement.dataset.theme;
  if (html === "light") return "light";
  if (html === "dark") return "dark";
  const body = document.body?.dataset.theme;
  return body === "light" ? "light" : "dark";
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
function rangeFromCss(raw: string, fallback: number): string {
  const n = parseFloat(raw);
  return String(Number.isFinite(n) ? n : fallback);
}
function selectFromCss(k: Knob & { kind: "select" }, raw: string): string {
  if (k.matchValue) return k.matchValue(raw);
  const opt = k.options.find((o) => norm(o.cssValue) === norm(raw));
  return opt?.value ?? k.options[0].value;
}
function valueForInput(k: Knob, raw: string): string {
  if (k.kind === "color") return toHex(raw || "#000000");
  if (k.kind === "range") return rangeFromCss(raw, k.min);
  return selectFromCss(k, raw);
}
function cssForKnob(k: Knob, input: string): string {
  if (k.kind === "color") return input;
  if (k.kind === "range") return input + k.unit;
  const opt = k.options.find((o) => o.value === input);
  return opt?.cssValue ?? "";
}

function getStyleEl(): HTMLStyleElement {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  return el;
}
function renderStylesheet(prefs: Prefs) {
  const blocks: string[] = [];
  const root = Object.entries(prefs._root);
  if (root.length) {
    blocks.push(`:root {\n${root.map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}`);
  }
  const dark = Object.entries(prefs.dark);
  if (dark.length) {
    // include `:root` so we also win when no data-theme attribute is set
    blocks.push(
      `:root, [data-theme="dark"] {\n${dark.map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}`,
    );
  }
  const light = Object.entries(prefs.light);
  if (light.length) {
    blocks.push(`[data-theme="light"] {\n${light.map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}`);
  }
  getStyleEl().textContent = blocks.join("\n\n");
}

/**
 * Read the bare CSS values for both themes by creating hidden probe
 * elements with `data-theme="dark"` and `data-theme="light"` and asking
 * `getComputedStyle` for each variable. Our override stylesheet is
 * temporarily cleared so probes get true defaults, not the user's
 * current overrides.
 */
function readBaselines(): { dark: Record<string, string>; light: Record<string, string> } {
  const styleEl = document.getElementById(STYLE_ID);
  const prev = styleEl?.textContent ?? "";
  if (styleEl) styleEl.textContent = "";

  const css =
    "position:absolute;left:-99999px;top:-99999px;width:1px;height:1px;visibility:hidden;pointer-events:none;contain:strict;";

  const dProbe = document.createElement("div");
  dProbe.setAttribute("data-theme", "dark");
  dProbe.style.cssText = css;
  const lProbe = document.createElement("div");
  lProbe.setAttribute("data-theme", "light");
  lProbe.style.cssText = css;
  document.body.appendChild(dProbe);
  document.body.appendChild(lProbe);

  const csD = getComputedStyle(dProbe);
  const csL = getComputedStyle(lProbe);
  const dark: Record<string, string> = {};
  const light: Record<string, string> = {};
  for (const k of KNOBS) {
    dark[k.id] = csD.getPropertyValue(k.id).trim();
    light[k.id] = csL.getPropertyValue(k.id).trim();
  }

  document.body.removeChild(dProbe);
  document.body.removeChild(lProbe);
  if (styleEl) styleEl.textContent = prev;
  return { dark, light };
}

function sanitizePrefs(prefs: Prefs, base: { dark: Record<string, string>; light: Record<string, string> }): Prefs {
  // Drop any override that matches the baseline — they'd be redundant.
  const out = emptyPrefs();
  for (const [k, v] of Object.entries(prefs._root)) {
    if (norm(v) !== norm(base.dark[k] ?? "") || norm(v) !== norm(base.light[k] ?? "")) out._root[k] = v;
  }
  for (const [k, v] of Object.entries(prefs.dark)) {
    if (norm(v) !== norm(base.dark[k] ?? "")) out.dark[k] = v;
  }
  for (const [k, v] of Object.entries(prefs.light)) {
    if (norm(v) !== norm(base.light[k] ?? "")) out.light[k] = v;
  }
  return out;
}

function loadPrefs(base: { dark: Record<string, string>; light: Record<string, string> }): Prefs {
  try {
    const v2 = localStorage.getItem(STORE_V2);
    if (v2) {
      const p = JSON.parse(v2) as Partial<Prefs>;
      return sanitizePrefs(
        {
          _root: (p._root as Record<string, string>) ?? {},
          dark: (p.dark as Record<string, string>) ?? {},
          light: (p.light as Record<string, string>) ?? {},
        },
        base,
      );
    }
    // Migrate legacy flat format. Assume the user was on dark (that's all v2.0
    // could write in practice, and our app's default theme is dark anyway).
    const v1 = localStorage.getItem(STORE_V1);
    if (v1) {
      const flat = JSON.parse(v1) as Record<string, string>;
      const migrated = emptyPrefs();
      for (const [k, v] of Object.entries(flat ?? {})) {
        let knob: Knob | undefined;
        let cssVal = v;
        if (k === "font-family") {
          knob = KNOBS.find((x) => x.id === "--font-sans");
          if (knob?.kind === "select") {
            const opt = knob.options.find((o) => o.value === v);
            cssVal = opt?.cssValue ?? "";
            if (!cssVal) continue;
          }
        } else {
          knob = KNOBS.find((x) => x.id === k);
        }
        if (!knob) continue;
        const bucket = knob.themeScoped ? migrated.dark : migrated._root;
        bucket[knob.id] = cssVal;
      }
      const sanitized = sanitizePrefs(migrated, base);
      localStorage.setItem(STORE_V2, JSON.stringify(sanitized));
      localStorage.removeItem(STORE_V1);
      return sanitized;
    }
  } catch {
    /* fall through */
  }
  return emptyPrefs();
}

function buildInputVals(
  theme: Theme,
  prefs: Prefs,
  base: { dark: Record<string, string>; light: Record<string, string> },
): Record<string, string> {
  const themed = theme === "dark" ? prefs.dark : prefs.light;
  const baseT = theme === "dark" ? base.dark : base.light;
  const out: Record<string, string> = {};
  for (const k of KNOBS) {
    const raw = k.themeScoped ? themed[k.id] ?? baseT[k.id] : prefs._root[k.id] ?? baseT[k.id];
    out[k.id] = valueForInput(k, raw ?? "");
  }
  return out;
}

function changedCountOf(prefs: Prefs) {
  return (
    Object.keys(prefs._root).length + Object.keys(prefs.dark).length + Object.keys(prefs.light).length
  );
}

export function DesignMode() {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [vals, setVals] = useState<Record<string, string>>({});
  const prefsRef = useRef<Prefs>(emptyPrefs());
  const baselineRef = useRef<{ dark: Record<string, string>; light: Record<string, string> }>({
    dark: {},
    light: {},
  });
  const [query, setQuery] = useState("");
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [exported, setExported] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"" | "copied" | "fallback">("");
  // forced re-render trigger when prefs change (since prefsRef is mutable)
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (isProdHost(window.location.hostname)) return;
    setEnabled(true);

    // 1) baselines (before any overrides applied)
    baselineRef.current = readBaselines();

    // 2) load + migrate prefs, inject stylesheet
    prefsRef.current = loadPrefs(baselineRef.current);
    renderStylesheet(prefsRef.current);

    // 3) UI state
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

    // 4) detect theme + init inputs
    const t0 = detectTheme();
    setTheme(t0);
    setVals(buildInputVals(t0, prefsRef.current, baselineRef.current));

    // 5) watch theme attribute on <html> (and <body> as a fallback)
    const observer = new MutationObserver(() => {
      const t = detectTheme();
      setTheme((prev) => {
        if (prev === t) return prev;
        setVals(buildInputVals(t, prefsRef.current, baselineRef.current));
        return t;
      });
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    if (document.body) {
      observer.observe(document.body, { attributes: true, attributeFilter: ["data-theme"] });
    }

    // 6) Shift+D toggles the panel (skipped while typing)
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "d" || !e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_UI, JSON.stringify({ collapsed, onlyChanged }));
    } catch {
      /* ignore */
    }
  }, [collapsed, onlyChanged]);

  function commit(next: Prefs) {
    prefsRef.current = next;
    renderStylesheet(next);
    try {
      localStorage.setItem(STORE_V2, JSON.stringify(next));
    } catch {
      /* quota / private mode */
    }
    setTick((n) => n + 1);
  }
  function bucketFor(prefs: Prefs, k: Knob, t: Theme): Record<string, string> {
    return k.themeScoped ? (t === "dark" ? prefs.dark : prefs.light) : prefs._root;
  }
  function baselineFor(k: Knob, t: Theme): string {
    const b = baselineRef.current;
    if (k.themeScoped) return (t === "dark" ? b.dark[k.id] : b.light[k.id]) ?? "";
    return b.dark[k.id] ?? b.light[k.id] ?? "";
  }

  function update(k: Knob, input: string) {
    const cssVal = cssForKnob(k, input);
    const next: Prefs = {
      _root: { ...prefsRef.current._root },
      dark: { ...prefsRef.current.dark },
      light: { ...prefsRef.current.light },
    };
    const bucket = bucketFor(next, k, theme);
    if (norm(cssVal) === norm(baselineFor(k, theme))) {
      delete bucket[k.id];
    } else {
      bucket[k.id] = cssVal;
    }
    commit(next);
    setVals((v) => ({ ...v, [k.id]: input }));
    setExported(null);
  }
  function resetAll() {
    commit(emptyPrefs());
    setVals(buildInputVals(theme, emptyPrefs(), baselineRef.current));
    setExported(null);
  }
  function resetGroup(group: string) {
    const next: Prefs = {
      _root: { ...prefsRef.current._root },
      dark: { ...prefsRef.current.dark },
      light: { ...prefsRef.current.light },
    };
    for (const k of KNOBS) {
      if (k.group !== group) continue;
      delete bucketFor(next, k, theme)[k.id];
    }
    commit(next);
    setVals(buildInputVals(theme, next, baselineRef.current));
    setExported(null);
  }
  function doExport() {
    const sections: string[] = [];
    const rootEntries = Object.entries(prefsRef.current._root);
    if (rootEntries.length) {
      sections.push(`/* Shared — ${rootEntries.length} change(s), apply to both themes */`);
      sections.push(`:root {`);
      for (const [k, v] of rootEntries) {
        sections.push(`  ${k}: ${v};   /* was ${baselineRef.current.dark[k] || "—"} */`);
      }
      sections.push(`}`);
    }
    for (const t of ["dark", "light"] as const) {
      const entries = Object.entries(prefsRef.current[t]);
      if (!entries.length) continue;
      if (sections.length) sections.push("");
      sections.push(`/* ${t} theme — ${entries.length} change(s) */`);
      sections.push(`[data-theme="${t}"] {`);
      for (const [k, v] of entries) {
        const base = baselineRef.current[t][k] || "—";
        sections.push(`  ${k}: ${v};   /* was ${base} */`);
      }
      sections.push(`}`);
    }
    const text = sections.length
      ? `ROKKI DESIGN MODE — apply these:\n\n${sections.join("\n")}`
      : "No changes yet — everything matches the current app.";
    setExported(text);
    setCopyState("");
    navigator.clipboard
      ?.writeText(text)
      .then(() => setCopyState("copied"))
      .catch(() => setCopyState("fallback"));
  }

  // `tick` is intentionally in the deps for memos that read mutable prefsRef.
  // Without it React wouldn't recompute when prefs change. eslint thinks the
  // dep is "unused" because tick isn't referenced in the body — it's used as
  // a re-eval signal.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return KNOBS.filter((k) => {
      if (q) {
        const hay = (k.label + " " + k.id + " " + k.group).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (onlyChanged) {
        const bucket = bucketFor(prefsRef.current, k, theme);
        if (!(k.id in bucket)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, onlyChanged, theme, tick]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const changedCount = useMemo(() => changedCountOf(prefsRef.current), [tick]);
  const changedActiveTheme = useMemo(() => {
    if (theme === "dark") return Object.keys(prefsRef.current.dark).length;
    return Object.keys(prefsRef.current.light).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, tick]);
  const otherTheme: Theme = theme === "dark" ? "light" : "dark";
  const changedOtherTheme = useMemo(
    () => Object.keys(prefsRef.current[otherTheme]).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme, tick, otherTheme],
  );

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
              <div style={S.title}>
                Design Mode <span style={S.v2}>v2.1</span>
              </div>
              <div style={S.sub}>Sandbox only · live · ⇧D to toggle</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} style={S.x} aria-label="Close">
              ✕
            </button>
          </div>

          {/* Theme indicator — the "what am I tuning?" cue */}
          <div style={S.themeStrip}>
            <span style={S.themeLabel}>Tuning</span>
            <span style={{ ...S.themePill, ...(theme === "dark" ? S.themePillDark : S.themePillLight) }}>
              {theme === "dark" ? "🌙 Dark theme" : "☀ Light theme"}
              {changedActiveTheme ? <span style={S.themeBadge}>{changedActiveTheme}</span> : null}
            </span>
            {changedOtherTheme ? (
              <span style={S.themeOther} title={`${otherTheme} theme has ${changedOtherTheme} change(s)`}>
                {otherTheme === "dark" ? "🌙" : "☀"} {otherTheme} · {changedOtherTheme}
              </span>
            ) : null}
            <span style={S.themeHint}>
              Colors save per-theme · type/layout save shared
            </span>
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
              <span>Only changed (this theme)</span>
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
                    <span>
                      {isCollapsed ? "▸" : "▾"} {g}
                    </span>
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
                        title={`Reset ${g} (this theme)`}
                      >
                        reset
                      </span>
                    </span>
                  </button>
                  {isCollapsed
                    ? null
                    : items.map((k) => (
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
              Color tweaks save <strong style={{ color: "#e6e6ea" }}>per theme</strong> — flip your
              theme to tune the other one without losing this side. Type, spacing, and layout are
              shared across themes. Hit <strong style={{ color: "#e6e6ea" }}>Export</strong> when
              you like the look — paste it to Claude and it gets baked into the app.
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
    width: 372,
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
  x: {
    background: "none",
    border: "none",
    color: "#8a8a92",
    fontSize: 16,
    cursor: "pointer",
    lineHeight: 1,
  },
  themeStrip: {
    display: "flex",
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderBottom: "1px solid #1c1c20",
    fontSize: 11.5,
  },
  themeLabel: { color: "#8a8a92", textTransform: "uppercase" as const, letterSpacing: ".06em", fontWeight: 600 },
  themePill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 8px",
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 600,
    border: "1px solid",
  },
  themePillDark: {
    background: "#16161a",
    borderColor: "#34343b",
    color: "#dadadf",
  },
  themePillLight: {
    background: "#f5f5f7",
    borderColor: "#d1d1d5",
    color: "#1a1a1d",
  },
  themeBadge: {
    background: "#f5a623",
    color: "#0a0a0b",
    fontSize: 10,
    fontWeight: 700,
    padding: "0 5px",
    borderRadius: 999,
  },
  themeOther: { color: "#8a8a92", fontSize: 11 },
  themeHint: {
    flexBasis: "100%",
    color: "#6f7078",
    fontSize: 10.5,
    lineHeight: 1.4,
    marginTop: 2,
  },
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
    height: 160,
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
  labRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 4,
  },
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
