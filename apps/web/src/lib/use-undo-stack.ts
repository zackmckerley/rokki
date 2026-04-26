"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Undo/redo for free-form text edits — descriptions, comments, anywhere a
 * user types prose into a controlled `<textarea>` or `<input>`.
 *
 * Usage
 * -----
 *   const { value, setValue, undo, redo, canUndo, canRedo, onKeyDown } =
 *     useUndoStack(initialText);
 *
 *   <textarea
 *     value={value}
 *     onChange={(e) => setValue(e.target.value)}
 *     onKeyDown={onKeyDown}      // catches ⌘Z / ⌘⇧Z (or Ctrl on Win/Linux)
 *   />
 *
 * Design notes
 * ------------
 *   • Pure in-memory. We persist *nothing* — closing the page wipes the
 *     stack. That's deliberate: this is a typing-affordance, not a draft
 *     manager. (Server-side drafts live elsewhere.)
 *
 *   • Debounced commits (default 200 ms). Holding a key down or typing a
 *     sentence is one undoable unit, not 50.
 *
 *   • Bounded ring (default 100 entries). If a user types and undoes for an
 *     hour, we don't grow without bound. The oldest entries get dropped
 *     first.
 *
 *   • Escape hatch: `setValue(next, { commit: true })` flushes the debounce
 *     and forces a snapshot. Useful for things like "paste" or
 *     "blur-to-save" where we want the boundary in the history right now.
 *
 *   • `reset(next)` blows the stack away and seeds it with `next`. Use this
 *     when the editor is reused for a different entity (e.g. switching
 *     comments) and you don't want the previous comment's history bleeding
 *     into the new one.
 *
 *   • Stable callbacks. `setValue` / `undo` / `redo` / `onKeyDown` keep
 *     identity across renders so they're safe to spread without causing
 *     downstream re-renders or effect re-fires.
 *
 *   • The ⌘Z / ⌘⇧Z handlers stop propagation only when there's something
 *     to undo / redo. That way the browser's own "undo last typing"
 *     behavior still works as a fallback if the stack is empty (e.g. the
 *     user typed for less than the debounce window).
 */

const DEFAULT_LIMIT = 100;
const DEFAULT_DEBOUNCE_MS = 200;

export interface UseUndoStackOptions {
  /** Maximum number of historical entries to keep. Default 100. */
  limit?: number;
  /** Coalesce consecutive `setValue` calls within this window. Default 200ms. */
  debounceMs?: number;
  /** Called when ⌘Z fires. Receives the value being reverted FROM (the one
   *  that was just on screen) and the value being reverted TO, plus the
   *  approximate seconds since the snapshot we're reverting to. Useful for
   *  toast notifications. */
  onUndo?: (info: { from: string; to: string; agoSeconds: number }) => void;
}

export interface UseUndoStackResult {
  value: string;
  setValue: (next: string, opts?: { commit?: boolean }) => void;
  undo: () => boolean;
  redo: () => boolean;
  canUndo: boolean;
  canRedo: boolean;
  /** Spread onto the textarea — handles ⌘Z / ⌘⇧Z (Cmd on macOS, Ctrl elsewhere). */
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  /** Wipe the stack and seed it with `next`. */
  reset: (next: string) => void;
}

interface Snapshot {
  value: string;
  /** Wall-clock ms when this snapshot was taken. */
  at: number;
}

export function useUndoStack(
  initial: string,
  options: UseUndoStackOptions = {},
): UseUndoStackResult {
  const limit = Math.max(2, options.limit ?? DEFAULT_LIMIT);
  const debounceMs = Math.max(0, options.debounceMs ?? DEFAULT_DEBOUNCE_MS);

  // We hold the visible value in React state (so the textarea re-renders),
  // but the history itself lives in a ref to avoid re-renders on every
  // keystroke. canUndo/canRedo are derived state we publish explicitly.
  const [value, setValueState] = useState<string>(initial);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Past = oldest -> most-recent committed snapshots, NOT including the
  //        current value. Top of past = the snapshot we'd undo to.
  // Future = entries we've undone past, ready to be redone (LIFO).
  const pastRef = useRef<Snapshot[]>([]);
  const futureRef = useRef<Snapshot[]>([]);
  const valueRef = useRef<string>(initial);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The last snapshot we committed. We use this to decide whether a new
  // setValue() should push a snapshot or just replace the trailing one.
  const lastCommittedRef = useRef<Snapshot>({ value: initial, at: Date.now() });

  // Stable accessor for the latest onUndo, so we don't need to reconstruct
  // callbacks every render when the consumer passes an inline lambda.
  const onUndoRef = useRef(options.onUndo);
  useEffect(() => {
    onUndoRef.current = options.onUndo;
  }, [options.onUndo]);

  const recompute = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  /**
   * Push the current value onto the past stack as a committed snapshot,
   * trimming to `limit`. No-op if the value matches the most recent
   * committed snapshot (avoids duplicate entries).
   */
  const commit = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const current = valueRef.current;
    if (current === lastCommittedRef.current.value) return;
    pastRef.current.push(lastCommittedRef.current);
    if (pastRef.current.length > limit) {
      // Drop oldest. We always preserve the original seed indirectly via
      // the natural ring behavior — once you've typed > limit characters,
      // the very first state isn't reachable anymore. That matches what
      // every other text editor does.
      pastRef.current.splice(0, pastRef.current.length - limit);
    }
    lastCommittedRef.current = { value: current, at: Date.now() };
    // Any new edit invalidates the redo stack (classic editor semantics).
    futureRef.current = [];
    recompute();
  }, [limit, recompute]);

  const setValue = useCallback(
    (next: string, opts?: { commit?: boolean }) => {
      // Visible state always updates immediately so the textarea stays
      // responsive — the history is what gets debounced.
      valueRef.current = next;
      setValueState(next);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }

      if (opts?.commit) {
        commit();
        return;
      }

      if (debounceMs <= 0) {
        commit();
        return;
      }

      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        commit();
      }, debounceMs);
    },
    [commit, debounceMs],
  );

  const undo = useCallback((): boolean => {
    // Flush any pending debounced edit so the user's most recent in-flight
    // typing becomes its own undoable snapshot, then pop.
    commit();
    const past = pastRef.current;
    if (past.length === 0) return false;
    const target = past.pop()!;
    const from = lastCommittedRef.current.value;
    futureRef.current.push(lastCommittedRef.current);
    lastCommittedRef.current = target;
    valueRef.current = target.value;
    setValueState(target.value);
    recompute();
    onUndoRef.current?.({
      from,
      to: target.value,
      agoSeconds: Math.max(0, Math.round((Date.now() - target.at) / 1000)),
    });
    return true;
  }, [commit, recompute]);

  const redo = useCallback((): boolean => {
    const future = futureRef.current;
    if (future.length === 0) return false;
    // No need to flush debounce here — if there's anything in the future
    // stack, the user hasn't typed since the last undo (any edit clears it).
    const target = future.pop()!;
    pastRef.current.push(lastCommittedRef.current);
    lastCommittedRef.current = target;
    valueRef.current = target.value;
    setValueState(target.value);
    recompute();
    return true;
  }, [recompute]);

  const reset = useCallback((next: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    pastRef.current = [];
    futureRef.current = [];
    lastCommittedRef.current = { value: next, at: Date.now() };
    valueRef.current = next;
    setValueState(next);
    recompute();
  }, [recompute]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      // ⌘⇧Z (or Ctrl+Y on some platforms) → redo
      if ((key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey)) {
        if (redo()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      // ⌘Z → undo
      if (key === "z" && !e.shiftKey) {
        if (undo()) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    },
    [undo, redo],
  );

  // Cleanup any pending debounce when the consumer unmounts. Without this,
  // a stray timer could fire after unmount and trigger a noop setState
  // warning in dev.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return useMemo(
    () => ({
      value,
      setValue,
      undo,
      redo,
      canUndo,
      canRedo,
      onKeyDown,
      reset,
    }),
    [value, setValue, undo, redo, canUndo, canRedo, onKeyDown, reset],
  );
}
