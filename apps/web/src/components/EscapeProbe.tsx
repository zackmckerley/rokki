"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Diagnostic probe for the "Escape kicks me out of Rokki" report.
 *
 * Two surfaces:
 *   1. **Console**: structured log of every Escape press — focused
 *      element, defaultPrevented state, open dialog count, modifier
 *      keys, plus URL 200ms later (so a navigation triggered by Escape
 *      is visible).
 *   2. **Floating panel** (bottom-right, low opacity): live event log
 *      so you can repro without DevTools. Click events to expand.
 *
 * **Activation**
 *   - Always on in `process.env.NODE_ENV !== "production"`.
 *   - In production: append `?debug-escape=1` to any URL, OR set
 *     `localStorage["rokki:debug-escape"] = "1"`.
 *
 * **Known "Escape kicks me out" patterns to investigate**
 *
 *   1. **Browser back via Backspace** (not Escape, but easily
 *      mistaken). If the user was focused outside a form field and
 *      pressed Backspace, some browsers navigate back. Check the
 *      panel: was the key actually "Escape" or "Backspace"?
 *
 *   2. **PWA fullscreen exit**. If Rokki is installed as a PWA in
 *      standalone display mode and the user pressed F11/fullscreen,
 *      Escape exits fullscreen. Could feel like "out of Rokki."
 *      Check `window.matchMedia('(display-mode: fullscreen)').matches`
 *      before vs after — the panel logs that.
 *
 *   3. **Modal close-cascade**. A Dialog opens implicitly (e.g.
 *      CreateOrgDialog from `?new=space` query), Escape closes it,
 *      onClose triggers a `router.replace("/")` that strips query
 *      params, the layout re-renders, the user sees the dashboard
 *      flash and confuses it with "logged out." The panel logs
 *      "before/after URL"; if URL changed within 200ms, that's the
 *      cause.
 *
 *   4. **SessionGuard race**. If the user opens a token, the token
 *      is revoked, the user presses Escape on a dialog while
 *      SessionGuard's realtime listener is firing — the realtime
 *      sign-out wins and the user sees the login page. The panel
 *      logs `console.warn` from SessionGuard via console capture.
 *
 *   5. **Browser extension** (Vimium, Surfingkeys, etc.) intercepts
 *      Escape and binds it to "go back" or "close tab." The panel
 *      logs `defaultPrevented` — if it's `true` before any of our
 *      handlers run, an extension is the most likely cause.
 *
 *   6. **Browser's native form reset on Escape**. Inside an `<input>`
 *      or `<textarea>`, some browsers clear the field on Escape.
 *      Doesn't sign you out — but if the field was a search input
 *      that drove a router push when cleared, an indirect navigation
 *      can result.
 *
 * The probe only OBSERVES. It never preventDefault's or stops
 * propagation, so the underlying handler chain is unaffected.
 */
export function EscapeProbe() {
  const [enabled, setEnabled] = useState(false);
  const [events, setEvents] = useState<EscapeEvent[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const beforeUrlRef = useRef<string>("");

  // Resolve activation. Read NODE_ENV at module level safely; default
  // to enabled in any non-prod environment, opt-in via query/localStorage
  // in prod.
  useEffect(() => {
    const isDev =
      process.env.NODE_ENV !== "production";
    const isOptedIn =
      new URLSearchParams(window.location.search).get("debug-escape") ===
        "1" || window.localStorage.getItem("rokki:debug-escape") === "1";
    setEnabled(isDev || isOptedIn);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    console.info(
      "[EscapeProbe] active — every Escape press will be logged. See bottom-right panel for live events.",
    );

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Backspace") return;
      // We capture Backspace too because users sometimes mis-report
      // which key they pressed; this lets the panel show the truth.
      const active = document.activeElement;
      const dialogCount = document.querySelectorAll('[role="dialog"]').length;
      const fullscreen =
        typeof window.matchMedia === "function"
          ? window.matchMedia("(display-mode: fullscreen)").matches
          : false;
      const event: EscapeEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        key: e.key,
        defaultPrevented: e.defaultPrevented,
        modifiers: [
          e.metaKey && "⌘",
          e.ctrlKey && "Ctrl",
          e.altKey && "Alt",
          e.shiftKey && "Shift",
        ]
          .filter(Boolean)
          .join("+"),
        activeTag: active?.tagName ?? null,
        activeId: (active as HTMLElement | null)?.id ?? null,
        activeAria:
          (active as HTMLElement | null)?.getAttribute("aria-label") ?? null,
        activeRole:
          (active as HTMLElement | null)?.getAttribute("role") ?? null,
        dialogsOpen: dialogCount,
        fullscreen,
        urlBefore: window.location.href,
        urlAfter: null,
        timestamp: new Date().toISOString(),
      };
      console.warn("[EscapeProbe] keydown:", event);
      beforeUrlRef.current = event.urlBefore;
      setEvents((prev) => [event, ...prev].slice(0, 25));
      window.setTimeout(() => {
        const after = window.location.href;
        if (after !== beforeUrlRef.current) {
          console.warn("[EscapeProbe] navigation after Escape:", {
            id: event.id,
            from: event.urlBefore,
            to: after,
          });
          setEvents((prev) =>
            prev.map((ev) =>
              ev.id === event.id ? { ...ev, urlAfter: after } : ev,
            ),
          );
        }
      }, 250);
    };

    // capture: true so we see the event before any other handler
    // can call stopPropagation.
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      role="region"
      aria-label="Escape probe diagnostic panel"
      className="fixed bottom-2 right-2 z-[2000] w-72 rounded border border-border bg-bg-1/95 font-mono text-[10px] text-text-1 shadow-lg backdrop-blur"
    >
      <div className="flex items-center justify-between border-b border-border bg-bg-2 px-2 py-1">
        <span className="font-semibold uppercase tracking-wider text-accent">
          Escape probe · {events.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEvents([])}
            className="rounded px-1 text-text-3 hover:bg-bg-3 hover:text-text-0"
          >
            clear
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded px-1 text-text-3 hover:bg-bg-3 hover:text-text-0"
          >
            {collapsed ? "▴" : "▾"}
          </button>
        </div>
      </div>
      {!collapsed ? (
        <div className="max-h-72 overflow-y-auto">
          {events.length === 0 ? (
            <p className="px-2 py-3 text-center text-text-3">
              Press Esc to log an event.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((ev) => (
                <li key={ev.id} className="px-2 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-text-0">
                      {ev.key}
                      {ev.modifiers ? `+${ev.modifiers}` : ""}
                    </span>
                    <span className="text-text-3">
                      {ev.timestamp.slice(11, 19)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-text-2">
                    focus:{" "}
                    <span className="text-text-1">
                      {ev.activeTag ?? "—"}
                      {ev.activeId ? `#${ev.activeId}` : ""}
                      {ev.activeAria ? ` (${ev.activeAria})` : ""}
                    </span>
                  </div>
                  <div className="text-text-2">
                    dialogs: <span className="text-text-1">{ev.dialogsOpen}</span>
                    {ev.fullscreen ? " · fullscreen" : ""}
                    {ev.defaultPrevented ? " · prevented" : ""}
                  </div>
                  {ev.urlAfter && ev.urlAfter !== ev.urlBefore ? (
                    <div className="mt-0.5 truncate rounded-sm bg-danger-subtle px-1 text-danger">
                      → {shortUrl(ev.urlAfter)}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface EscapeEvent {
  id: string;
  key: string;
  defaultPrevented: boolean;
  modifiers: string;
  activeTag: string | null;
  activeId: string | null;
  activeAria: string | null;
  activeRole: string | null;
  dialogsOpen: number;
  fullscreen: boolean;
  urlBefore: string;
  urlAfter: string | null;
  timestamp: string;
}

function shortUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return parsed.pathname + parsed.search;
  } catch {
    return u.slice(0, 40);
  }
}
