/**
 * Recently-viewed terminals — local-only ring stored in localStorage.
 *
 * The Explorer rail surfaces the last N terminals the user opened so they
 * can context-switch without scrolling the tree. We keep this strictly
 * client-side because:
 *   - It's a pure UX convenience, not a security boundary.
 *   - It's per-device — what you opened on your laptop shouldn't bleed
 *     onto your phone, since the device is the locality of attention.
 *   - It avoids a server round-trip on every terminal page render.
 *
 * Shape: `{ ticker, name, ts }[]`, newest first, deduped by ticker, max 5.
 */

const STORAGE_KEY = "rokki:recent-terminals";
const MAX_ENTRIES = 5;

export interface RecentTerminal {
  ticker: string;
  name: string;
  /** ISO timestamp of the last visit. */
  ts: string;
}

export function readRecentTerminals(): RecentTerminal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentTerminal =>
          !!e &&
          typeof e === "object" &&
          typeof (e as RecentTerminal).ticker === "string" &&
          typeof (e as RecentTerminal).name === "string" &&
          typeof (e as RecentTerminal).ts === "string",
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function pushRecentTerminal(entry: { ticker: string; name: string }) {
  if (typeof window === "undefined") return;
  try {
    const current = readRecentTerminals();
    const filtered = current.filter((e) => e.ticker !== entry.ticker);
    const next: RecentTerminal[] = [
      { ticker: entry.ticker, name: entry.name, ts: new Date().toISOString() },
      ...filtered,
    ].slice(0, MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Notify any subscribers (e.g. the ExplorerRail) that the list
    // changed so they re-render. localStorage events don't fire in the
    // same tab — we use a CustomEvent for cross-component sync.
    window.dispatchEvent(new CustomEvent("rokki:recent-terminals-changed"));
  } catch {
    // localStorage can throw — non-fatal.
  }
}

/** Storage key used by the persisted-collapse-state hook in ExplorerRail. */
export const COLLAPSED_SPACES_KEY = "rokki:explorer:collapsed-spaces";
