/**
 * Tiny in-browser fuzzy search for the build-time help index.
 *
 * Why no library: the codebase avoids new runtime deps (BUILD_SPEC). The
 * help index is small (a few hundred sections), the search is local,
 * and the matching needs only to be "good enough" — exact substring
 * wins, then per-token coverage with a position bonus.
 *
 * Returned scores are unnormalized — bigger is better. Callers sort
 * desc and slice to a top-N.
 */

export interface HelpIndexSection {
  doc: string;
  doc_title: string;
  anchor: string;
  heading: string;
  level: number;
  snippet: string;
  searchable: string;
}

export interface HelpIndexFile {
  generated_at: string;
  sections: HelpIndexSection[];
}

export interface HelpSearchResult {
  section: HelpIndexSection;
  score: number;
}

/**
 * Score a single section against the lowercased, whitespace-split
 * query tokens. Returns 0 when no token hits.
 */
function scoreSection(section: HelpIndexSection, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const hay = section.searchable;
  const headLower = section.heading.toLowerCase();

  let score = 0;
  let allHit = true;
  for (const tok of tokens) {
    if (!tok) continue;
    const idx = hay.indexOf(tok);
    if (idx === -1) {
      allHit = false;
      continue;
    }
    score += 4;
    // Heading matches are much more informative than body matches.
    if (headLower.includes(tok)) score += 8;
    // Position bonus: earlier in the searchable blob is usually
    // a higher-relevance match (heading sits at index 0).
    if (idx < 80) score += 2;
    // Whole-word bonus.
    const re = new RegExp(`\\b${tok.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`);
    if (re.test(hay)) score += 2;
  }
  // Big multiplier when EVERY token landed — favours specific queries.
  if (allHit && tokens.length > 1) score *= 1.5;

  // Headings are slightly more useful than deep h3s.
  if (section.level === 1) score += 2;
  return score;
}

export function searchHelp(
  index: HelpIndexFile | null,
  query: string,
  limit = 12,
): HelpSearchResult[] {
  if (!index || !query.trim()) return [];
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];
  const results: HelpSearchResult[] = [];
  for (const section of index.sections) {
    const score = scoreSection(section, tokens);
    if (score > 0) results.push({ section, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

/**
 * Render the snippet with the matched substrings highlighted. We return
 * an array of {text, hit} chunks — the React layer wraps `hit` chunks
 * in <mark>. Done in pure data so the lib stays React-free.
 */
export function highlight(
  text: string,
  query: string,
): { text: string; hit: boolean }[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const hits: { start: number; end: number }[] = [];
  for (const tok of tokens) {
    let from = 0;
    while (true) {
      const idx = lower.indexOf(tok, from);
      if (idx === -1) break;
      hits.push({ start: idx, end: idx + tok.length });
      from = idx + tok.length;
    }
  }
  if (hits.length === 0) return [{ text, hit: false }];
  // Merge overlapping ranges.
  hits.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const h of hits) {
    const top = merged[merged.length - 1];
    if (top && h.start <= top.end) {
      top.end = Math.max(top.end, h.end);
    } else {
      merged.push({ ...h });
    }
  }
  const out: { text: string; hit: boolean }[] = [];
  let cursor = 0;
  for (const m of merged) {
    if (m.start > cursor) out.push({ text: text.slice(cursor, m.start), hit: false });
    out.push({ text: text.slice(m.start, m.end), hit: true });
    cursor = m.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), hit: false });
  return out;
}
