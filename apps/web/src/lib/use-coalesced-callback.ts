import { useCallback, useEffect, useRef } from "react";

/**
 * Wrap a callback so a burst of calls collapses into a single trailing
 * invocation after `delayMs` of quiet.
 *
 * Built for realtime-event refetch storms: Signal delivery/read receipts fire
 * many rapid UPDATEs, and each one used to trigger a full conversation/inbox
 * refetch. Coalescing keeps the refetch authoritative (we still re-pull the
 * whole list — no risk of an incremental-patch desync) while cutting N refetches
 * down to one. The returned function identity is stable, so it's safe to use in
 * effect deps and realtime handlers.
 */
export function useCoalescedCallback(
  fn: () => void,
  delayMs = 250,
): () => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      fnRef.current();
    }, delayMs);
  }, [delayMs]);
}
