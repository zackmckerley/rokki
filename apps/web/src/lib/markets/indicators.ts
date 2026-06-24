/**
 * Technical-indicator math for the price chart. Pure + framework-free so it is
 * unit-testable and reusable across the chart's overlays. Each function returns
 * an array aligned 1:1 with the input, with `null` for points that don't yet
 * have enough history.
 */

/** Simple moving average. Null for the first (period-1) points. */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}

/**
 * Exponential moving average. Seeded with the SMA of the first `period` points
 * (null before that); smoothing factor k = 2/(period+1).
 */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += values[i]!;
  prev /= period; // seed = SMA of the first `period` values
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
