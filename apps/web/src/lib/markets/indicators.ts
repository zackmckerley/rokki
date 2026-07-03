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

/**
 * Relative Strength Index (Wilder's smoothing), bounded 0–100. Null until the
 * first `period` deltas are available. >70 ≈ overbought, <30 ≈ oversold.
 */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length <= period) return out;

  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i]! - values[i - 1]!;
    if (d >= 0) gain += d;
    else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  // avgLoss === 0 with avgGain > 0 → maximally overbought (100). But a FLAT
  // series has avgLoss === 0 AND avgGain === 0 (no movement) → neutral (50),
  // not 100.
  out[period] =
    avgLoss === 0
      ? avgGain === 0
        ? 50
        : 100
      : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < values.length; i++) {
    const d = values[i]! - values[i - 1]!;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] =
      avgLoss === 0
        ? avgGain === 0
          ? 50
          : 100
        : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}
