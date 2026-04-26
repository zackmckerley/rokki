"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { tipFor } from "@/lib/help-tips";

interface HelpTipProps {
  /** Key into apps/web/src/lib/help-tips.ts. */
  term: string;
  /** Visible label this tip annotates (the "?" sits to the right of it). */
  children?: ReactNode;
  /** Position the popover above (default: below). */
  position?: "above" | "below";
  /** Tighter render — no label, just the icon. */
  iconOnly?: boolean;
  className?: string;
}

/**
 * Inline contextual help. Renders a `?` chip next to a UI label that,
 * on hover or focus, pops a one-sentence explanation pulled from the
 * curated help-tips registry.
 *
 * Accessibility:
 *   - the chip is a button (keyboard-focusable, screen-reader visible)
 *   - the popover is `role="tooltip"` linked via aria-describedby
 *   - hover OR focus opens; Esc dismisses focus state
 */
export function HelpTip({
  term,
  children,
  position = "below",
  iconOnly = false,
  className,
}: HelpTipProps) {
  const tip = tipFor(term);
  const [open, setOpen] = useState(false);
  const id = useId();

  // No tip → render the children unchanged. This is intentional so that
  // a typo in `term` degrades gracefully (the page still renders) while
  // becoming visible during dev review.
  if (!tip) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`<HelpTip> has no tip for term="${term}"`);
    }
    return <>{children}</>;
  }

  return (
    <span className={cn("relative inline-flex items-baseline gap-1", className)}>
      {iconOnly ? null : children}
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label={`Help: ${term}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="inline-flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full text-text-3 hover:text-accent focus-visible:text-accent focus-visible:outline-none"
      >
        <HelpCircle className="h-3 w-3" aria-hidden="true" />
      </button>
      {open ? (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "absolute left-0 z-50 w-64 rounded-md border border-border bg-bg-1 px-3 py-2 text-xs text-text-1 shadow-lg",
            position === "above"
              ? "bottom-full mb-1"
              : "top-full mt-1",
          )}
        >
          {tip.body}
          {tip.more ? (
            <>
              {" "}
              <Link
                href={tip.more}
                className="text-accent underline-offset-2 hover:underline"
              >
                Learn more →
              </Link>
            </>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}
