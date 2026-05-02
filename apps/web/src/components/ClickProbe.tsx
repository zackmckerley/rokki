"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Diagnostic probe for "clicks don't navigate" reports.
 *
 * Captures every click that bubbles to the document with capture=true
 * (so we see it before any handler can stopPropagation or preventDefault),
 * then logs whether a navigation followed within 250ms.
 *
 * Two surfaces:
 *   1. Console: structured log per click — target chain, closest <a>
 *      / closest [role=button], defaultPrevented at capture time AND at
 *      bubble time, plus URL before/after.
 *   2. Floating panel (bottom-right) showing the last 10 click events
 *      colour-coded by what happened.
 *
 * Activation:
 *   - Visit any page with `?debug-click=1`, OR set
 *     localStorage["rokki:debug-click"] = "1" once.
 *   - Disable by removing the URL param + clearing the localStorage key.
 *
 * The probe never preventDefaults or stopPropagates — it only observes.
 */
export function ClickProbe() {
  const [enabled, setEnabled] = useState(false);
  const [events, setEvents] = useState<ClickEvent[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const beforeUrlRef = useRef<string>("");

  useEffect(() => {
    const isOptedIn =
      new URLSearchParams(window.location.search).get("debug-click") ===
        "1" || window.localStorage.getItem("rokki:debug-click") === "1";
    setEnabled(isOptedIn);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    console.info(
      "[ClickProbe] active — every click will be logged. See bottom-right panel for live events.",
    );

    // Capture phase — runs before any in-tree handler can stopPropagation.
    const onCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const path = (e.composedPath() as HTMLElement[]).slice(0, 8);
      const closestAnchor = (target?.closest("a") ??
        null) as HTMLAnchorElement | null;
      const closestButton =
        target?.closest('button, [role="button"]') ?? null;
      const ev: ClickEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        targetTag: target?.tagName ?? null,
        targetText: target?.textContent?.trim().slice(0, 32) ?? null,
        anchorHref: closestAnchor?.getAttribute("href") ?? null,
        anchorTag: closestAnchor ? "A" : null,
        buttonTag: closestButton ? "BUTTON" : null,
        defaultPreventedAtCapture: e.defaultPrevented,
        defaultPreventedAtBubble: null,
        urlBefore: window.location.href,
        urlAfter: null,
        pathTags: path.map((el) => el?.tagName ?? "?").join(" → "),
      };
      console.info("[ClickProbe] capture:", ev);
      beforeUrlRef.current = ev.urlBefore;
      setEvents((prev) => [ev, ...prev].slice(0, 10));
      // Bubble-phase listener that completes the same event record.
      const onBubble = (be: MouseEvent) => {
        if (be !== e) return;
        ev.defaultPreventedAtBubble = be.defaultPrevented;
        document.removeEventListener("click", onBubble, false);
        setEvents((prev) =>
          prev.map((p) =>
            p.id === ev.id ? { ...p, defaultPreventedAtBubble: be.defaultPrevented } : p,
          ),
        );
      };
      document.addEventListener("click", onBubble, false);
      window.setTimeout(() => {
        const after = window.location.href;
        if (after !== beforeUrlRef.current) {
          ev.urlAfter = after;
          setEvents((prev) =>
            prev.map((p) => (p.id === ev.id ? { ...p, urlAfter: after } : p)),
          );
          console.info("[ClickProbe] navigation:", {
            id: ev.id,
            from: ev.urlBefore,
            to: after,
          });
        } else if (ev.anchorHref) {
          // Anchor was clicked but URL didn't change — that's the bug
          // we're chasing.
          console.warn("[ClickProbe] anchor click without navigation:", ev);
        }
      }, 250);
    };

    document.addEventListener("click", onCapture, true);
    return () => document.removeEventListener("click", onCapture, true);
  }, [enabled]);

  if (!enabled) return null;
  return (
    <div
      role="region"
      aria-label="Click probe diagnostic panel"
      className="fixed bottom-2 left-2 z-[2000] w-80 rounded border border-border bg-bg-1/95 font-mono text-[10px] text-text-1 shadow-lg backdrop-blur"
    >
      <div className="flex items-center justify-between border-b border-border bg-bg-2 px-2 py-1">
        <span className="font-semibold uppercase tracking-wider text-accent">
          Click probe · {events.length}
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
              Click anything — this panel will show what happened.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {events.map((ev) => {
                const navigated = ev.urlAfter && ev.urlAfter !== ev.urlBefore;
                const wasAnchor = !!ev.anchorHref;
                const verdict = navigated
                  ? "OK"
                  : wasAnchor
                    ? "BLOCKED"
                    : ev.buttonTag
                      ? "BUTTON"
                      : "—";
                const verdictColor = navigated
                  ? "text-success"
                  : wasAnchor
                    ? "text-danger"
                    : "text-text-3";
                return (
                  <li key={ev.id} className="px-2 py-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold ${verdictColor}`}>
                        {verdict}
                      </span>
                      <span className="text-text-3">
                        {ev.timestamp.slice(11, 19)}
                      </span>
                    </div>
                    {ev.anchorHref ? (
                      <div className="mt-0.5 truncate text-accent">
                        → {ev.anchorHref}
                      </div>
                    ) : null}
                    <div className="mt-0.5 truncate text-text-2">
                      target: {ev.targetTag}
                      {ev.targetText ? ` "${ev.targetText}"` : ""}
                    </div>
                    {ev.defaultPreventedAtCapture ||
                    ev.defaultPreventedAtBubble ? (
                      <div className="mt-0.5 truncate rounded-sm bg-warning-subtle px-1 text-warning">
                        prevented · capture=
                        {String(ev.defaultPreventedAtCapture)} bubble=
                        {String(ev.defaultPreventedAtBubble)}
                      </div>
                    ) : null}
                    {navigated ? (
                      <div className="mt-0.5 truncate rounded-sm bg-success-subtle px-1 text-success">
                        → {shortUrl(ev.urlAfter!)}
                      </div>
                    ) : wasAnchor ? (
                      <div className="mt-0.5 truncate rounded-sm bg-danger-subtle px-1 text-danger">
                        URL did not change
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface ClickEvent {
  id: string;
  timestamp: string;
  targetTag: string | null;
  targetText: string | null;
  anchorHref: string | null;
  anchorTag: string | null;
  buttonTag: string | null;
  defaultPreventedAtCapture: boolean;
  defaultPreventedAtBubble: boolean | null;
  urlBefore: string;
  urlAfter: string | null;
  pathTags: string;
}

function shortUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return parsed.pathname + parsed.search;
  } catch {
    return u.slice(0, 40);
  }
}
