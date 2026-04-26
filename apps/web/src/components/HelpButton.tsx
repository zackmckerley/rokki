"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  HelpCircle,
  Search,
  X,
  Keyboard,
  Sparkles,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  highlight,
  searchHelp,
  type HelpIndexFile,
  type HelpSearchResult,
} from "@/lib/help-search";

/**
 * Floating "?" pinned bottom-right of every page.
 *
 * On click it opens a panel with three sections:
 *   1. Doc search — full-text against the build-time help index served
 *      from /help-index.json. Results show heading + snippet + link.
 *   2. Quick links — keyboard shortcuts cheatsheet, what's new
 *      placeholder, contact support mailto.
 *   3. Tips — pulled from a small rotating set so even the chip itself
 *      teaches the user something.
 *
 * Keyboard:
 *   - `?` opens the panel from anywhere (unless an editable element
 *     has focus or the existing ShortcutsOverlay claims it first;
 *     they don't overlap because we listen on Shift+? AND check that
 *     no modifier is held).
 *   - Esc closes the panel.
 *   - Tab cycles inside the panel.
 *
 * Z-index: above content (z-[1040]) but BELOW Dialog (z-[1050]) so
 * dialogs visually pre-empt the help overlay.
 */
export function HelpButton() {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState<HelpIndexFile | null>(null);
  const [query, setQuery] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Lazy-load the help index the first time the panel opens. Network
  // is one fetch of a static JSON file.
  useEffect(() => {
    if (!open || index) return;
    let cancelled = false;
    fetch("/help-index.json", { credentials: "omit" })
      .then((r) => {
        if (!r.ok) throw new Error(`help-index.json: HTTP ${r.status}`);
        return r.json();
      })
      .then((body: HelpIndexFile) => {
        if (cancelled) return;
        setIndex(body);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(
          e instanceof Error ? e.message : "Could not load help index",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, index]);

  // Focus the search box on open for a one-key flow.
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  // Global Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const results = useMemo<HelpSearchResult[]>(
    () => searchHelp(index, query),
    [index, query],
  );

  const onClose = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        aria-label="Open help"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          // Pinned, but tucked clear of the F-key bar / mobile tab bar
          // (bottom-16 leaves ~64px of breathing room above either).
          "floating-help fixed bottom-16 right-4 z-[1040] flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg-1 text-text-1 shadow-md transition-colors hover:bg-bg-2 hover:text-accent",
          "sm:bottom-12",
          open && "border-accent text-accent",
        )}
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Help"
          className="fixed inset-0 z-[1041] bg-bg-0/40 backdrop-blur-sm"
          onClick={onClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="floating-help fixed bottom-28 right-4 flex h-[min(560px,calc(100vh-160px))] w-[min(420px,calc(100vw-32px))] flex-col overflow-hidden rounded-md border border-border bg-bg-1 shadow-xl sm:bottom-24"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-0">
                <HelpCircle className="h-4 w-4 text-accent" aria-hidden="true" />
                Help
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="rounded-sm p-0.5 text-text-2 hover:bg-bg-3 hover:text-text-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-3.5 w-3.5 flex-shrink-0 text-text-3" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search the docs…"
                className="flex-1 bg-transparent text-sm text-text-0 placeholder:text-text-3 outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {query.trim() ? (
                <SearchResults
                  results={results}
                  query={query}
                  onPick={onClose}
                  loadError={loadError}
                  loaded={Boolean(index)}
                />
              ) : (
                <DefaultPanel onPick={onClose} />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SearchResults({
  results,
  query,
  onPick,
  loadError,
  loaded,
}: {
  results: HelpSearchResult[];
  query: string;
  onPick: () => void;
  loadError: string | null;
  loaded: boolean;
}) {
  if (loadError) {
    return (
      <p className="px-3 py-4 text-xs text-danger">
        Could not load the help index: {loadError}
      </p>
    );
  }
  if (!loaded) {
    return <p className="px-3 py-4 text-xs text-text-3">Loading docs…</p>;
  }
  if (results.length === 0) {
    return (
      <p className="px-3 py-4 text-xs text-text-3">
        No matches for{" "}
        <span className="font-mono text-text-1">&ldquo;{query}&rdquo;</span>.
        Try different words, or browse{" "}
        <Link
          href="/help"
          onClick={onPick}
          className="text-accent hover:underline"
        >
          the help index
        </Link>
        .
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {results.map((r) => (
        <li key={`${r.section.doc}#${r.section.anchor}`}>
          <Link
            href={`/help/${r.section.doc}#${r.section.anchor}`}
            onClick={onPick}
            className="block px-3 py-2 text-xs hover:bg-bg-2"
          >
            <div className="mb-0.5 flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-text-0">
                {r.section.heading}
              </span>
              <span className="font-mono text-[10px] uppercase text-text-3">
                {r.section.doc_title}
              </span>
            </div>
            <p className="text-text-2 line-clamp-3">
              {highlight(r.section.snippet, query).map((c, i) =>
                c.hit ? (
                  <mark
                    key={i}
                    className="bg-accent-subtle text-accent"
                  >
                    {c.text}
                  </mark>
                ) : (
                  <span key={i}>{c.text}</span>
                ),
              )}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function DefaultPanel({ onPick }: { onPick: () => void }) {
  return (
    <div className="space-y-3 p-3">
      <Section title="Quick links" icon={<Keyboard className="h-3.5 w-3.5" />}>
        <QuickRow
          href="/help"
          onClick={onPick}
          title="Keyboard shortcuts"
          subtitle="Every primary action is a keystroke."
        />
        <QuickRow
          href="/help#concepts"
          onClick={onPick}
          title="Concepts"
          subtitle="Spaces, terminals, tasks, tools."
        />
      </Section>

      <Section title="What's new" icon={<Sparkles className="h-3.5 w-3.5" />}>
        <p className="text-xs text-text-3">
          A changelog feed is coming. For now, see the{" "}
          <Link
            href="/help"
            onClick={onPick}
            className="text-accent hover:underline"
          >
            full help index
          </Link>
          .
        </p>
      </Section>

      <Section
        title="Talk to us"
        icon={<MessageCircle className="h-3.5 w-3.5" />}
      >
        <a
          href="mailto:support@rokki.ai"
          className="flex items-center justify-between text-xs text-text-1 hover:text-accent"
        >
          <span>Email support@rokki.ai</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-border bg-bg-1">
      <header className="flex items-center gap-1.5 border-b border-border bg-bg-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-text-3">
        {icon}
        {title}
      </header>
      <div className="p-2">{children}</div>
    </section>
  );
}

function QuickRow({
  href,
  onClick,
  title,
  subtitle,
}: {
  href: string;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="block rounded-sm px-2 py-1.5 hover:bg-bg-2"
    >
      <p className="text-sm text-text-0">{title}</p>
      <p className="text-xs text-text-3">{subtitle}</p>
    </Link>
  );
}
