"use client";

import { Copy, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Click-to-copy chip for IDs, slugs, tickers, tokens — anywhere ops staff
 * need to grab the literal value out of a row. The full value is always
 * preserved on the clipboard regardless of how it's truncated for display.
 *
 * Visual contract:
 *   - mono `text-xs` value, optional ellipsis truncation
 *   - tiny clipboard icon on the right (h-3 w-3)
 *   - on click → copy + flash a check icon for 1.5s
 *   - aria-label "Copy {label}" so screen readers know what's being copied
 *
 * Use anywhere you previously rendered `value.slice(0, 8)` plus a separate
 * copy button — replace both with one of these.
 */
export function CopyableId({
  value,
  label,
  display,
  truncate,
  className,
  prefix,
}: {
  /** The full string to put on the clipboard. */
  value: string;
  /** What this is, for the aria-label. e.g. "user id", "ticker". */
  label: string;
  /**
   * Override the visible string. Defaults to `value` (or a truncated form
   * when `truncate` is set).
   */
  display?: string;
  /**
   * If set, show the first N chars + `…`. Useful for UUIDs in dense tables.
   * Ignored when `display` is set.
   */
  truncate?: number;
  className?: string;
  /** Optional sigil shown before the value (e.g. "/", "$"). Not copied. */
  prefix?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  const visible =
    display ??
    (truncate && value.length > truncate ? `${value.slice(0, truncate)}…` : value);

  function copy() {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(value).then(() => setCopied(true));
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${label}`}
      title={value}
      className={cn(
        "group inline-flex max-w-full items-center gap-1 rounded-sm border border-transparent px-1 py-0.5 font-mono text-xs text-text-2 hover:border-border hover:bg-bg-2 hover:text-text-0",
        className,
      )}
    >
      {prefix ? <span className="text-text-3">{prefix}</span> : null}
      <span className="truncate">{visible}</span>
      {copied ? (
        <Check className="h-3 w-3 flex-shrink-0 text-success" aria-hidden="true" />
      ) : (
        <Copy
          className="h-3 w-3 flex-shrink-0 text-text-3 opacity-60 group-hover:opacity-100"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
