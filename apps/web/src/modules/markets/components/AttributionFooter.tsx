/**
 * Data attribution footer. Free-tier feeds require credit; this is part of the
 * module layout so it can't be forgotten. Static — no provider import needed.
 */
export function AttributionFooter() {
  return (
    <footer className="mt-4 border-t border-border px-1 pt-2 text-[10px] text-text-3">
      Market data by Finnhub &amp; Twelve Data · fundamentals by Financial
      Modeling Prep. Quotes may be delayed. For information only — not investment
      advice.
    </footer>
  );
}
