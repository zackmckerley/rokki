/**
 * FIFO realized-gains accounting from a lot ledger — pure, no I/O.
 *
 * Complements the average-cost view in `portfolio.ts`: matches each sell
 * against the earliest open buy lots (first-in-first-out), so each realized
 * gain carries a true holding period (short- vs long-term, the >1-year US
 * tax boundary). Buy fees raise the lot's cost basis; sell fees reduce
 * proceeds, allocated pro-rata across the shares sold. Unmatched sell shares
 * (a sell with no remaining buys — e.g. a short or incomplete ledger) are
 * skipped, since there's no basis to compute against.
 *
 * NOT a tax filing: wash-sale adjustments are intentionally out of scope.
 */
import type { MktLotRow } from "./db";

export interface RealizedGain {
  symbol: string;
  /** Shares closed in this match. */
  quantity: number;
  /** Sale proceeds for these shares (net of pro-rata sell fees). */
  proceeds: number;
  /** FIFO-matched buy cost (incl. buy fees) for these shares. */
  costBasis: number;
  /** proceeds − costBasis. */
  gain: number;
  /** trade_date of the matched buy lot. */
  openedAt: string;
  /** trade_date of the sell. */
  closedAt: string;
  /** Long-term: held more than one year (sold on/after the day after the
   *  one-year anniversary of the buy). */
  longTerm: boolean;
}

export interface RealizedSummary {
  totalGain: number;
  shortTermGain: number;
  longTermGain: number;
  /** Gains whose sale closed in `year`. */
  ytdGain: number;
  /** Number of matched lots. */
  count: number;
}

/**
 * US long-term test: held MORE than one year. The holding period starts the
 * day AFTER acquisition, so a sale on the one-year anniversary is still
 * short-term and long-term begins the day after. Classify by calendar
 * anniversary (not a raw 365-day count, which a leap day shifts by one).
 */
function isLongTerm(buyIso: string, sellIso: string): boolean {
  const buy = new Date(buyIso);
  const sell = new Date(sellIso);
  if (Number.isNaN(buy.getTime()) || Number.isNaN(sell.getTime())) return false;
  const cutoff = Date.UTC(
    buy.getUTCFullYear() + 1,
    buy.getUTCMonth(),
    buy.getUTCDate() + 1,
  );
  return sell.getTime() >= cutoff;
}

interface OpenLot {
  qty: number;
  costPerShare: number;
  date: string;
}

/**
 * FIFO-match the ledger and return one realized-gain record per (sell, matched
 * buy lot) pair, oldest match first. Buys before sells when dated the same day.
 */
export function realizedGains(lots: MktLotRow[]): RealizedGain[] {
  const sorted = [...lots].sort((a, b) => {
    if (a.trade_date !== b.trade_date)
      return a.trade_date < b.trade_date ? -1 : 1;
    // Same day: process buys before sells so a same-day round trip matches.
    if (a.side !== b.side) return a.side === "buy" ? -1 : 1;
    return 0;
  });

  const open = new Map<string, OpenLot[]>();
  const out: RealizedGain[] = [];

  for (const lot of sorted) {
    const qty = Number(lot.quantity);
    const price = Number(lot.price);
    const fees = Number(lot.fees) || 0;
    if (!(qty > 0) || !Number.isFinite(price)) continue;

    if (lot.side === "buy") {
      const queue = open.get(lot.symbol) ?? [];
      queue.push({
        qty,
        costPerShare: price + fees / qty,
        date: lot.trade_date,
      });
      open.set(lot.symbol, queue);
      continue;
    }

    // sell → consume open buy lots FIFO
    const queue = open.get(lot.symbol) ?? [];
    const sellFeePerShare = fees / qty;
    let remaining = qty;
    while (remaining > 1e-9 && queue.length > 0) {
      const front = queue[0]!;
      const take = Math.min(remaining, front.qty);
      const proceeds = take * price - take * sellFeePerShare;
      const costBasis = take * front.costPerShare;
      out.push({
        symbol: lot.symbol,
        quantity: take,
        proceeds,
        costBasis,
        gain: proceeds - costBasis,
        openedAt: front.date,
        closedAt: lot.trade_date,
        longTerm: isLongTerm(front.date, lot.trade_date),
      });
      front.qty -= take;
      remaining -= take;
      if (front.qty <= 1e-9) queue.shift();
    }
    // any `remaining` is an unmatched sell → skipped (no basis)
  }

  return out;
}

/** Roll up realized gains into totals + short/long-term + a year's YTD slice. */
export function summarizeRealized(
  gains: RealizedGain[],
  year: number,
): RealizedSummary {
  let totalGain = 0;
  let shortTermGain = 0;
  let longTermGain = 0;
  let ytdGain = 0;
  for (const g of gains) {
    totalGain += g.gain;
    if (g.longTerm) longTermGain += g.gain;
    else shortTermGain += g.gain;
    if (new Date(g.closedAt).getUTCFullYear() === year) ytdGain += g.gain;
  }
  return { totalGain, shortTermGain, longTermGain, ytdGain, count: gains.length };
}
