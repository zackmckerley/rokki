"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, Keyboard } from "lucide-react";
import {
  SHORTCUT_SECTIONS,
  isEditableTarget,
  type Shortcut,
} from "@/lib/shortcuts";

/**
 * Global `?` cheatsheet overlay. Mounted once at the layout root so every
 * page can pop it without wiring up local state. Press `?` anywhere outside
 * a text input to open; `Esc` to close.
 *
 * The same shortcut list lives at `/help` — this overlay is just a faster
 * in-place reference.
 */
export function ShortcutsOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (open) return;
      // `?` is Shift+/ on US layouts. Accept both the literal "?" key and
      // Shift+/ so we work across localized keyboards.
      const isHelp =
        e.key === "?" || (e.shiftKey && e.key === "/" && !e.metaKey && !e.ctrlKey);
      if (!isHelp) return;
      if (isEditableTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      className="fixed inset-0 z-[1100] flex items-start justify-center bg-bg-0/80 p-6 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="mt-10 flex w-full max-w-4xl flex-col overflow-hidden rounded-md border border-border bg-bg-1 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-border bg-bg-2 px-4 py-2.5">
          <Keyboard className="h-4 w-4 text-accent" aria-hidden="true" />
          <h2
            id="shortcuts-title"
            className="text-sm font-semibold text-text-0"
          >
            Keyboard shortcuts
          </h2>
          <span className="text-xs text-text-3">
            Press{" "}
            <kbd className="rounded-sm border border-border bg-bg-3 px-1 font-mono text-[10px] text-text-2">
              Esc
            </kbd>{" "}
            to close
          </span>
          <Link
            href="/help"
            className="ml-auto text-xs text-text-2 hover:text-text-0"
            onClick={() => setOpen(false)}
          >
            Full reference →
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close shortcuts"
            className="rounded p-1 text-text-2 hover:bg-bg-3 hover:text-text-0"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="grid max-h-[70vh] grid-cols-1 gap-x-6 gap-y-5 overflow-y-auto p-5 md:grid-cols-2">
          {SHORTCUT_SECTIONS.map((s) => (
            <section key={s.id} aria-labelledby={`sc-${s.id}-h`}>
              <h3
                id={`sc-${s.id}-h`}
                className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-3"
              >
                {s.title}
              </h3>
              <ul className="divide-y divide-border rounded border border-border bg-bg-0">
                {s.shortcuts.map((sc) => (
                  <ShortcutRow key={sc.description} sc={sc} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function ShortcutRow({ sc }: { sc: Shortcut }) {
  return (
    <li className="flex items-center gap-3 px-3 py-1.5 text-xs">
      <span className="flex-1 text-text-1">{sc.description}</span>
      <KeyHint keys={sc.keys} />
    </li>
  );
}

/**
 * Render "⌘⇧P" / "G then D" / "S then T / I / B / R / D" as individual kbds.
 * Splits on spaces so each token prints as a key.
 */
export function KeyHint({ keys }: { keys: string }) {
  return (
    <span className="flex flex-shrink-0 items-center gap-1 font-mono">
      {keys.split(" ").map((tok, i) =>
        tok.toLowerCase() === "then" || tok === "/" ? (
          <span key={i} className="text-[10px] text-text-3">
            {tok}
          </span>
        ) : (
          <kbd
            key={i}
            className="rounded-sm border border-border bg-bg-3 px-1.5 py-0.5 text-[10px] text-text-2"
          >
            {tok}
          </kbd>
        ),
      )}
    </span>
  );
}
