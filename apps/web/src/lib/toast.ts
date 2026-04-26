/**
 * Toast queue — a tiny pub/sub used by the global `<Toaster />` provider.
 *
 * The codebase deliberately avoids `react-hot-toast`, `sonner`, and friends —
 * a transient banner doesn't need a 30 KB dependency. Subscribers receive the
 * full list on every change so the renderer stays a pure function of state.
 *
 * Public API:
 *   - `toast.success("Saved")`
 *   - `toast.error("Could not save")`
 *   - `toast.info("Heads-up")`
 *   - `toast.dismiss(id)`        // remove a specific toast
 *   - `toast.dismissAll()`       // clear the queue
 *
 * Variant defaults:
 *   - success / info → 4 s
 *   - error          → 8 s   (gives the user time to read what failed)
 *
 * Pass `{ duration: Infinity }` for a sticky toast (caller is responsible
 * for dismissing it).
 */

export type ToastVariant = "success" | "error" | "info";

export interface ToastOptions {
  /**
   * Auto-dismiss after this many milliseconds. `Infinity` disables
   * auto-dismiss. Defaults to 4 000 (8 000 for errors).
   */
  duration?: number;
  /**
   * Stable id — passing the same id twice replaces the existing toast
   * instead of stacking a duplicate. Useful for status updates that
   * progress through multiple states ("Uploading…" → "Uploaded").
   */
  id?: string;
}

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
  duration: number;
  /** Wall-clock createdAt — used for ordering and as a render key. */
  createdAt: number;
}

type Listener = (toasts: Toast[]) => void;

const listeners = new Set<Listener>();
let toasts: Toast[] = [];
let counter = 0;

function nextId(): string {
  counter += 1;
  // Combine a counter with a timestamp slice so ids stay unique even if
  // the counter wraps after a very long-lived session.
  return `t_${Date.now().toString(36)}_${counter.toString(36)}`;
}

function emit() {
  // Snapshot so listeners can safely mutate during iteration.
  const snapshot = toasts;
  for (const l of listeners) l(snapshot);
}

function publish(
  variant: ToastVariant,
  message: string,
  options?: ToastOptions,
): string {
  const defaultDuration = variant === "error" ? 8000 : 4000;
  const duration = options?.duration ?? defaultDuration;
  const id = options?.id ?? nextId();

  const next: Toast = {
    id,
    variant,
    message,
    duration,
    createdAt: Date.now(),
  };

  // Replace by id when one already exists; otherwise append.
  const existingIdx = toasts.findIndex((t) => t.id === id);
  if (existingIdx >= 0) {
    toasts = [
      ...toasts.slice(0, existingIdx),
      next,
      ...toasts.slice(existingIdx + 1),
    ];
  } else {
    toasts = [...toasts, next];
  }
  emit();
  return id;
}

export const toast = {
  success(message: string, options?: ToastOptions): string {
    return publish("success", message, options);
  },
  error(message: string, options?: ToastOptions): string {
    return publish("error", message, options);
  },
  info(message: string, options?: ToastOptions): string {
    return publish("info", message, options);
  },
  dismiss(id: string): void {
    const before = toasts.length;
    toasts = toasts.filter((t) => t.id !== id);
    if (toasts.length !== before) emit();
  },
  dismissAll(): void {
    if (toasts.length === 0) return;
    toasts = [];
    emit();
  },
};

/**
 * Subscribe to queue changes. Returns an unsubscribe function. Called by
 * the `<Toaster />` provider — not part of the everyday public API.
 */
export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  // Sync immediately so newcomers see whatever's already queued.
  listener(toasts);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Read the current queue. Exists for tests and the provider's `useSyncExternalStore`
 * snapshot; prefer `subscribeToasts` for live updates.
 */
export function getToasts(): Toast[] {
  return toasts;
}
