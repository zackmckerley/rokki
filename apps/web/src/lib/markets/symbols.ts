/**
 * Stock-symbol normalization + validation.
 *
 * A market "symbol" (AAPL, BRK.B, BTC-USD, ^GSPC) is deliberately separate
 * from a Rokki terminal "ticker" (terminals.ticker, validated by
 * apps/mcp-server/src/ticker.ts). Do not reuse the terminal-ticker helpers
 * for instruments — symbols allow ".", "-", ":", "^" and are case-folded.
 */

const SYMBOL_RE = /^[A-Z0-9][A-Z0-9.\-:^]{0,19}$/;

/** Upper-case and trim a user-entered symbol. */
export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Validate a normalized symbol (1–20 chars, allowed instrument chars). */
export function isValidSymbol(raw: string): boolean {
  const s = normalizeSymbol(raw);
  return SYMBOL_RE.test(s);
}
