/**
 * Rates board — benchmark interest rates from FRED (Federal Reserve Economic
 * Data). Server-only: carries the FRED API key.
 *
 * FRED is the authoritative, free source for the rates Zack tracks: Treasury
 * bill/note yields (the constant-maturity series), SOFR, the bank Prime rate,
 * and the effective Fed Funds rate. A FRED key is free (instant signup at
 * fred.stlouisfed.org) — when `FRED_API_KEY` is unset the board degrades to a
 * "add a key" prompt, exactly like Markets TV without a YouTube key.
 *
 * Each series is one cheap observations call; we pull the latest two points to
 * show the value and its day-over-day change. The whole board is cached for an
 * hour since these update at most daily.
 *
 * Docs: https://fred.stlouisfed.org/docs/api/fred/series_observations.html
 */
import "server-only";
import { fetchJson, hasKey, requireKey, MarketDataError } from "./http";

const KEY_ENV = "FRED_API_KEY";
const BASE = "https://api.stlouisfed.org/fred";

export interface RateRow {
  /** FRED series id (stable key). */
  id: string;
  label: string;
  /** Latest value in percent, or null when unavailable. */
  value: number | null;
  /** Day-over-day change in percentage points, or null. */
  change: number | null;
  /** ISO date of the latest observation, or null. */
  asOf: string | null;
}

export interface RatesBoard {
  /** Treasury constant-maturity yields, short → long. */
  treasury: RateRow[];
  /** Reference/overnight rates: SOFR, Prime, Fed Funds. */
  reference: RateRow[];
}

interface SeriesDef {
  id: string;
  label: string;
}

// Treasury constant-maturity yields. The bills (≤1Y) are what "T-bills" means;
// 2Y/10Y/30Y give the curve context a professional board shows alongside.
const TREASURY: SeriesDef[] = [
  { id: "DGS1MO", label: "1M" },
  { id: "DGS3MO", label: "3M" },
  { id: "DGS6MO", label: "6M" },
  { id: "DGS1", label: "1Y" },
  { id: "DGS2", label: "2Y" },
  { id: "DGS10", label: "10Y" },
  { id: "DGS30", label: "30Y" },
];

const REFERENCE: SeriesDef[] = [
  { id: "SOFR", label: "SOFR" },
  { id: "DPRIME", label: "Prime" },
  { id: "DFF", label: "Fed Funds" },
];

/** Whether the rates board can be served (FRED key present). */
export function ratesAvailable(): boolean {
  return hasKey(KEY_ENV);
}

interface FredObsResponse {
  observations?: { date: string; value: string }[];
}

/** Parse a FRED value string ("." means missing). */
function parseVal(v: string | undefined): number | null {
  if (!v || v === ".") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchSeries(def: SeriesDef, key: string): Promise<RateRow> {
  try {
    // Pull headroom (not just 2): the latest FRED rows are often "." while a
    // value is pending, and weekends/holidays are missing — so the freshest
    // real value + true prior business-day value can sit a few rows deep.
    const url =
      `${BASE}/series/observations?series_id=${encodeURIComponent(def.id)}` +
      `&api_key=${encodeURIComponent(key)}&file_type=json` +
      `&sort_order=desc&limit=8`;
    const data = await fetchJson<FredObsResponse>(url, { provider: "fred" });
    const obs = (data.observations ?? []).filter((o) => parseVal(o.value) !== null);
    const latest = obs[0];
    const prev = obs[1];
    const value = latest ? parseVal(latest.value) : null;
    const prevValue = prev ? parseVal(prev.value) : null;
    const change =
      value !== null && prevValue !== null
        ? Math.round((value - prevValue) * 1000) / 1000
        : null;
    return { id: def.id, label: def.label, value, change, asOf: latest?.date ?? null };
  } catch {
    // One bad series shouldn't blank the board.
    return { id: def.id, label: def.label, value: null, change: null, asOf: null };
  }
}

let cache: { board: RatesBoard; at: number } | null = null;
const TTL_MS = 60 * 60_000;

/**
 * The full rates board, cached for an hour. Throws MarketDataError(503) when
 * FRED_API_KEY is missing — the route maps that to a "not configured" payload.
 */
export async function getRatesBoard(): Promise<RatesBoard> {
  const key = requireKey(KEY_ENV, "FRED");
  if (cache && Date.now() - cache.at < TTL_MS) return cache.board;

  const [treasury, reference] = await Promise.all([
    Promise.all(TREASURY.map((d) => fetchSeries(d, key))),
    Promise.all(REFERENCE.map((d) => fetchSeries(d, key))),
  ]);
  const board: RatesBoard = { treasury, reference };
  // Don't memoize a board where every series failed (transient FRED outage or a
  // cold-start network race) — caching it would pin the ribbon to all-null for
  // a full hour even after FRED recovers. Serve it once, retry next request.
  const hasAny = [...treasury, ...reference].some((r) => r.value !== null);
  if (hasAny) cache = { board, at: Date.now() };
  return board;
}

/** Test seam — drop the in-memory cache. */
export function __resetRatesCache(): void {
  cache = null;
}

export { MarketDataError };
