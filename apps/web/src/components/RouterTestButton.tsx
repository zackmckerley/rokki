"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Diagnostic button for the "clicks don't navigate" bug. Renders a
 * small floating panel with three test paths. Each button calls
 * router.push() directly (bypassing Next.js Link) — if these work but
 * sidebar Links don't, the bug is in <Link> dispatch, not the router.
 *
 * Pings the click-log table via the existing diagnostic sink so we
 * can see results server-side without asking the user to screenshot.
 *
 * Activates the same way the ClickProbe used to: any /p/* page, OR
 * ?debug-router=1 anywhere.
 */
export function RouterTestButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [last, setLast] = useState<string | null>(null);

  // Activation gate (lazy so we don't accidentally render in SSR).
  if (typeof window !== "undefined" && !enabled) {
    const onTerminal = window.location.pathname.startsWith("/p/");
    const optedIn =
      new URLSearchParams(window.location.search).get("debug-router") === "1";
    if (onTerminal || optedIn) {
      setEnabled(true);
    }
  }
  if (!enabled) return null;

  const test = async (path: string) => {
    const before = window.location.href;
    setLast(`pushing ${path}…`);
    try {
      router.push(path);
    } catch (e) {
      setLast(`threw: ${e instanceof Error ? e.message : String(e)}`);
    }
    // Log result after 500ms so we can see if URL changed.
    window.setTimeout(() => {
      const after = window.location.href;
      const ok = after !== before;
      setLast(
        ok ? `OK → ${shortUrl(after)}` : `STILL ON ${shortUrl(before)}`,
      );
      try {
        void fetch("/api/v1/health/click-log", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: before,
            payload: {
              kind: "ROUTER_TEST",
              attempted: path,
              urlBefore: before,
              urlAfter: after,
              ok,
            },
          }),
          keepalive: true,
        });
      } catch {
        /* ignore */
      }
    }, 500);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-2 top-12 z-[2000] rounded-sm border border-accent bg-accent-subtle px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-accent shadow-md hover:bg-accent/20"
        title="Open router-test panel"
      >
        ROUTER TEST
      </button>
    );
  }
  return (
    <div className="fixed right-2 top-12 z-[2000] flex w-64 flex-col gap-1 rounded border border-accent bg-bg-1/95 p-2 font-mono text-[10px] text-text-1 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <span className="font-semibold uppercase text-accent">router test</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-text-3 hover:text-text-0"
        >
          ×
        </button>
      </div>
      <p className="text-text-3">
        Each button calls router.push() directly. Logs to server.
      </p>
      <button
        type="button"
        onClick={() => test("/")}
        className="rounded-sm bg-bg-2 px-2 py-1 text-left hover:bg-bg-3"
      >
        push /
      </button>
      <button
        type="button"
        onClick={() => test("/tools")}
        className="rounded-sm bg-bg-2 px-2 py-1 text-left hover:bg-bg-3"
      >
        push /tools
      </button>
      <button
        type="button"
        onClick={() => test("/settings")}
        className="rounded-sm bg-bg-2 px-2 py-1 text-left hover:bg-bg-3"
      >
        push /settings
      </button>
      <button
        type="button"
        onClick={() => {
          const before = window.location.href;
          window.location.href = "/";
          window.setTimeout(() => {
            setLast(
              window.location.href !== before
                ? `LOC.HREF OK → ${shortUrl(window.location.href)}`
                : `LOC.HREF STUCK on ${shortUrl(before)}`,
            );
          }, 500);
        }}
        className="rounded-sm border border-warning bg-warning-subtle px-2 py-1 text-left text-warning hover:bg-warning/20"
      >
        location.href = / (hard nav)
      </button>
      {last ? (
        <p className="rounded-sm border border-border bg-bg-0 px-2 py-1 text-text-2">
          {last}
        </p>
      ) : null}
    </div>
  );
}

function shortUrl(u: string): string {
  try {
    const parsed = new URL(u);
    return parsed.pathname + parsed.search;
  } catch {
    return u.slice(0, 40);
  }
}
