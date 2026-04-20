/**
 * Ticker generation.
 * Rule: uppercase, starts with a letter, 2–10 chars, [A-Z0-9] only.
 * See docs/02_API.md §2.6.2.
 */
const VALID_TICKER = /^[A-Z][A-Z0-9]{1,9}$/;

const CONSONANT_MAP: Record<string, string> = {
  // Strip diacritics; simple ASCII-fold.
};

function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

/**
 * Generate a candidate ticker from a project name.
 * Strategy: take first consonants of each word (up to 6), fall back to alphanumerics.
 */
export function suggestTicker(name: string): string {
  const normalized = normalize(name);
  const words = normalized.split(/[^A-Z0-9]+/).filter(Boolean);

  // First try: initial of each word (max 6)
  const initials = words
    .map((w) => w[0])
    .filter((c) => /[A-Z]/.test(c))
    .slice(0, 6)
    .join("");
  if (initials.length >= 2) return initials.padEnd(2, "0").slice(0, 10);

  // Fallback: consonants from the combined string (max 6)
  const consonants = normalized.replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, "");
  if (consonants.length >= 2) return consonants.slice(0, 6);

  // Absolute fallback
  const alnum = normalized.replace(/[^A-Z0-9]/g, "");
  if (alnum.length >= 2) return alnum.slice(0, 6);

  return "PRJ";
}

export function isValidTicker(s: string): boolean {
  return VALID_TICKER.test(s);
}

/**
 * Given a base suggestion and a list of taken tickers in the same org,
 * return a ticker that doesn't collide by appending a number.
 */
export function uniqueTicker(suggestion: string, taken: string[]): string {
  if (!taken.includes(suggestion)) return suggestion;
  for (let i = 2; i <= 99; i++) {
    const candidate = `${suggestion.slice(0, 8)}${i}`;
    if (!taken.includes(candidate)) return candidate;
  }
  // Give up and use a time-based suffix
  const suffix = Date.now().toString(36).toUpperCase().slice(-3);
  return `${suggestion.slice(0, 7)}${suffix}`;
}
