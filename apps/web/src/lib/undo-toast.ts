"use client";

/**
 * Tiny adapter for "user just hit ⌘Z, tell them what we reverted to."
 *
 * Today there's no shared Toaster on this branch — when one lands (the
 * toasts-and-forms work), swap the body of `announceUndo` for a call into
 * it. Until then we log to the console so the signal isn't lost during dev,
 * but we deliberately don't `alert()` or otherwise interrupt the user. A
 * silent undo with a console breadcrumb is better than a loud, ugly modal.
 *
 * The shape of `announceUndo({ from, to, agoSeconds })` matches what the
 * `useUndoStack`'s `onUndo` callback produces, so wiring is one line at the
 * call site.
 */
export interface AnnounceUndoArgs {
  /** The text that was on screen right before ⌘Z (kept in case a future
   *  Toaster wants to show a diff). */
  from: string;
  /** The text we just reverted to. */
  to: string;
  /** Approximate seconds since the snapshot we're reverting to. */
  agoSeconds: number;
  /** Optional short label, e.g. "description" or "comment". Helps if the
   *  toast surface ever needs to disambiguate. */
  context?: string;
}

export function announceUndo(args: AnnounceUndoArgs): void {
  const ago = formatAgo(args.agoSeconds);
  const message = `Reverted to ${ago} — ⌘⇧Z to redo.`;
  // When the Toaster lands on this branch, replace the if/else below with
  //   import { toast } from "@/lib/toast";
  //   toast.info(message);
  // and delete this comment.
  if (typeof window !== "undefined") {
    const w = window as unknown as {
      __rokkiToast?: (kind: string, msg: string) => void;
    };
    if (typeof w.__rokkiToast === "function") {
      w.__rokkiToast("info", message);
      return;
    }
  }
  // Fallback — keep it visible in dev tools without yelling at the user.
  console.info(`[undo${args.context ? ` · ${args.context}` : ""}] ${message}`);
}

function formatAgo(seconds: number): string {
  if (seconds < 1) return "a moment ago";
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"} ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}
