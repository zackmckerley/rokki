/**
 * Pure helpers for merging Signal threads into the unified Messages inbox.
 * DOM-free and side-effect-free so they're unit-testable and shared between
 * the threads API (server) and the inbox UI (client types).
 */

export type ThreadSource = "rokki" | "signal";

/** A thread row as the inbox consumes it — native or Signal, one shape. */
export interface InboxThread {
  id: string;
  /** Native kind ("dm" | "terminal" | …) or "signal". */
  kind: string;
  source: ThreadSource;
  label: string;
  last_message_at: string;
  /** Signal-only: recipient number/uuid or group id — the send target. */
  signal_id?: string;
  /** Signal-only: direct vs group conversation. */
  signal_kind?: "direct" | "group";
  href_ticker?: string | null;
  other_user_id?: string | null;
}

/** Shape selected from the `signal_threads` table. */
export interface SignalThreadRow {
  id: string;
  signal_id: string;
  kind: string;
  title: string | null;
  last_message_at: string | null;
  created_at: string;
}

/** Map a `signal_threads` row to a unified inbox thread. */
export function signalThreadToInbox(t: SignalThreadRow): InboxThread {
  const signalKind: "direct" | "group" =
    t.kind === "group" ? "group" : "direct";
  const title = t.title?.trim();
  return {
    id: t.id,
    kind: "signal",
    source: "signal",
    label: title || t.signal_id,
    last_message_at: t.last_message_at ?? t.created_at,
    signal_id: t.signal_id,
    signal_kind: signalKind,
  };
}

/** Merge native + Signal threads into one list, newest activity first. */
export function mergeInboxThreads(
  native: InboxThread[],
  signal: InboxThread[],
): InboxThread[] {
  return [...native, ...signal].sort(
    (a, b) =>
      new Date(b.last_message_at).getTime() -
      new Date(a.last_message_at).getTime(),
  );
}
