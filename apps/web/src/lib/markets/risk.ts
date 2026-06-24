/**
 * Return + risk statistics from a price (close) series. Pure + framework-free
 * so it's unit-testable. Deliberately annualization-free — the chart's bar
 * interval varies by range (intraday vs daily vs weekly), so these are reported
 * over the series as shown rather than scaled to a year (which would be wrong
 * for intraday bars).
 */

/** Period-over-period simple returns. Skips a bar whose prior close is 0. */
export function dailyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1]!;
    if (prev !== 0) out.push((closes[i]! - prev) / prev);
  }
  return out;
}

/** Sample standard deviation (n-1). Returns 0 for fewer than 2 points. */
export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Max peak-to-trough drawdown over the series, as a positive fraction
 *  (0.2 = a 20% drop from a prior peak). */
export function maxDrawdown(closes: number[]): number {
  let peak = -Infinity;
  let maxDD = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    if (peak > 0) {
      const dd = (peak - c) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }
  return maxDD;
}

/** Total return across the series (first → last close), as a fraction. */
export function totalReturn(closes: number[]): number {
  if (closes.length < 2) return 0;
  const first = closes[0]!;
  return first !== 0 ? (closes[closes.length - 1]! - first) / first : 0;
}
