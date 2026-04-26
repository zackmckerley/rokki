"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getToasts,
  subscribeToasts,
  toast,
  type Toast,
  type ToastVariant,
} from "@/lib/toast";

/**
 * Global toast surface — mounted once at the root layout (next to
 * `<ShortcutsOverlay />`). Renders into a fixed bottom-right stack via a
 * React portal, so it sits above page chrome and dialogs.
 *
 * Hover the stack to pause auto-dismiss timers (Bloomberg-y; the user is
 * reading). Click any toast to dismiss it explicitly. Escape clears all.
 *
 * No emoji, lucide icons only, h-3.5 w-3.5. Same color tokens as the rest
 * of the app — `bg-bg-1`, `border-border`, success/danger/accent for the
 * variant chip.
 */
export function Toaster() {
  const items = useSyncExternalStore(
    subscribeToasts,
    getToasts,
    () => EMPTY,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Esc clears the stack — same instinct as dismissing the cmd palette.
  // Skip when an editable element has focus so we don't fight the dialog
  // close handlers in `Dialog.tsx`.
  useEffect(() => {
    if (items.length === 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      toast.dismissAll();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);

  if (!mounted) return null;
  if (items.length === 0) return null;

  return createPortal(
    <ol
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-[1200] flex w-full max-w-sm flex-col gap-2"
    >
      {items.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </ol>,
    document.body,
  );
}

// Stable empty array for SSR snapshot to keep `useSyncExternalStore` happy.
const EMPTY: Toast[] = [];

function ToastCard({ toast: t }: { toast: Toast }) {
  const [hovered, setHovered] = useState(false);
  // Track whether the entrance animation should run. Off on first paint,
  // flipped on after mount so the slide-up fires.
  const [shown, setShown] = useState(false);
  // Track elapsed time so pausing on hover doesn't reset the timer; we
  // measure the gap between mount and hover-in, then resume from there.
  const elapsedRef = useRef(0);
  const startedAtRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Defer one frame so the browser commits the initial transform before
    // we transition to the in-flight state.
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!Number.isFinite(t.duration)) return; // sticky toast
    if (hovered) {
      // Pause: capture how far we got.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      elapsedRef.current += Date.now() - startedAtRef.current;
      return;
    }
    // (Re)start with whatever time is left.
    const remaining = Math.max(t.duration - elapsedRef.current, 0);
    startedAtRef.current = Date.now();
    timerRef.current = setTimeout(() => toast.dismiss(t.id), remaining);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [hovered, t.id, t.duration]);

  return (
    <li
      role="status"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => toast.dismiss(t.id)}
      className={cn(
        "pointer-events-auto group flex cursor-pointer items-start gap-2 rounded-md border bg-bg-1 px-3 py-2 shadow-lg",
        "transition-all duration-medium",
        shown
          ? "translate-y-0 opacity-100"
          : "translate-y-2 opacity-0",
        BORDER_BY_VARIANT[t.variant],
      )}
    >
      <VariantIcon variant={t.variant} />
      <p className="flex-1 text-xs leading-tight text-text-1">{t.message}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => {
          // The card itself dismisses on click; stop propagation so we
          // don't double-fire (harmless but noisy in the listener set).
          e.stopPropagation();
          toast.dismiss(t.id);
        }}
        className="-mr-1 rounded-sm p-0.5 text-text-3 opacity-0 transition-opacity hover:bg-bg-3 hover:text-text-0 group-hover:opacity-100 focus-visible:opacity-100"
      >
        <X className="h-3 w-3" />
      </button>
    </li>
  );
}

function VariantIcon({ variant }: { variant: ToastVariant }) {
  const className = cn(
    "mt-0.5 h-3.5 w-3.5 flex-shrink-0",
    COLOR_BY_VARIANT[variant],
  );
  let icon: ReactNode;
  if (variant === "success") icon = <CheckCircle2 className={className} />;
  else if (variant === "error") icon = <XCircle className={className} />;
  else icon = <Info className={className} />;
  return icon;
}

const COLOR_BY_VARIANT: Record<ToastVariant, string> = {
  success: "text-success",
  error: "text-danger",
  info: "text-accent",
};

const BORDER_BY_VARIANT: Record<ToastVariant, string> = {
  // Tint the left border in the variant color so the stack is scannable
  // even when several toasts are queued. Keep the rest of the border
  // neutral — too much chroma fights the rest of the chrome.
  success: "border-border border-l-success border-l-2",
  error: "border-border border-l-danger border-l-2",
  info: "border-border border-l-accent border-l-2",
};
