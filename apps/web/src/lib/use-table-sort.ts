"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Sortable cell value. Strings sort lexicographically (case-insensitive),
 * numbers sort numerically, dates sort by epoch, null/undefined always sort
 * last regardless of direction so empty cells don't dominate the top of the
 * table.
 */
export type SortValue = string | number | Date | null | undefined;

export type SortDirection = "asc" | "desc";

export interface SortState {
  /** Active sort key, e.g. "created_at". Empty string = no sort. */
  key: string;
  dir: SortDirection;
}

export interface UseTableSortResult<Row> {
  /** Current sort state (read from URL search params). */
  sort: SortState;
  /** Click handler for headers — toggles direction or switches column. */
  onSortClick: (key: string) => void;
  /** Sorted (and optionally filtered) view of `rows`. */
  sorted: Row[];
  /** Returns "↑", "↓", or null for the chevron next to a header. */
  arrow: (key: string) => "asc" | "desc" | null;
}

interface Options<Row> {
  rows: Row[];
  /**
   * Maps a row + sort key to a comparable value. Return `null`/`undefined`
   * for cells with no value; those are always sorted to the bottom.
   */
  getValue: (row: Row, key: string) => SortValue;
  /** Default sort applied when no `?sort=` is in the URL. */
  defaultSort?: SortState;
  /**
   * Optional in-memory filter applied before sort. Kept here so a single
   * pass produces the rendered list.
   */
  filter?: (row: Row) => boolean;
  /**
   * URL-search-param key for the sort column. Lets two tables on one page
   * coexist (e.g. quotas + near-cap). Defaults to "sort".
   */
  paramKey?: string;
  /** Direction param key. Defaults to "dir". */
  dirParamKey?: string;
}

/**
 * Reads sort state from `?sort=&dir=` in the URL, returns sorted rows + a
 * click handler that updates the URL (replaces history so the back button
 * still escapes the table).
 *
 * The hook is data-source agnostic: caller fetches rows however they like
 * (REST, server props, RSC) and tells us how to extract a comparable value
 * for each (row, key) pair.
 */
export function useTableSort<Row>({
  rows,
  getValue,
  defaultSort,
  filter,
  paramKey = "sort",
  dirParamKey = "dir",
}: Options<Row>): UseTableSortResult<Row> {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sort: SortState = useMemo(() => {
    const key = searchParams.get(paramKey) ?? defaultSort?.key ?? "";
    const dirRaw = searchParams.get(dirParamKey);
    const dir: SortDirection =
      dirRaw === "asc" || dirRaw === "desc"
        ? dirRaw
        : (defaultSort?.dir ?? "desc");
    return { key, dir };
  }, [searchParams, paramKey, dirParamKey, defaultSort?.key, defaultSort?.dir]);

  const onSortClick = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const sameKey = (params.get(paramKey) ?? defaultSort?.key ?? "") === key;
      const currentDir = params.get(dirParamKey) ?? defaultSort?.dir ?? "desc";
      const nextDir: SortDirection = sameKey
        ? currentDir === "asc"
          ? "desc"
          : "asc"
        : "asc";
      params.set(paramKey, key);
      params.set(dirParamKey, nextDir);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [
      router,
      pathname,
      searchParams,
      paramKey,
      dirParamKey,
      defaultSort?.key,
      defaultSort?.dir,
    ],
  );

  const sorted: Row[] = useMemo(() => {
    const filtered = filter ? rows.filter(filter) : rows.slice();
    if (!sort.key) return filtered;
    const dirMul = sort.dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => compareValues(
      getValue(a, sort.key),
      getValue(b, sort.key),
    ) * dirMul);
  }, [rows, filter, sort.key, sort.dir, getValue]);

  const arrow = useCallback(
    (key: string): "asc" | "desc" | null => (sort.key === key ? sort.dir : null),
    [sort.key, sort.dir],
  );

  return { sort, onSortClick, sorted, arrow };
}

/**
 * Lowercase, trims, and concatenates the cell values of a row that the
 * caller wants to expose to the free-text filter. Returns true when the
 * `query` (also lowercased) appears as a substring in any of them. Empty
 * `query` always returns true so the predicate stays cheap.
 */
export function makeFuzzyFilter<Row>(
  query: string,
  toStrings: (row: Row) => Array<string | number | null | undefined>,
): (row: Row) => boolean {
  const q = query.trim().toLowerCase();
  if (!q) return () => true;
  return (row: Row) => {
    for (const v of toStrings(row)) {
      if (v == null) continue;
      if (String(v).toLowerCase().includes(q)) return true;
    }
    return false;
  };
}

function compareValues(a: SortValue, b: SortValue): number {
  // null/undefined always sort last regardless of direction.
  const aNull = a === null || a === undefined || a === "";
  const bNull = b === null || b === undefined || b === "";
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  const aN = toNumeric(a);
  const bN = toNumeric(b);
  if (aN !== null && bN !== null) return aN - bN;
  return String(a).toLowerCase().localeCompare(String(b).toLowerCase());
}

function toNumeric(v: SortValue): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === "string") {
    // ISO timestamp?
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
      const ms = Date.parse(v);
      if (!Number.isNaN(ms)) return ms;
    }
  }
  return null;
}
