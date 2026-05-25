/**
 * Look up a terminal by either its slug (new, lowercase-dashed) or
 * its legacy ticker (uppercase abbreviation). All `/p/<segment>`
 * routes and the matching `/api/v1/projects/<segment>/...` endpoints
 * funnel through here so:
 *
 *   1. New links generate slug URLs.
 *   2. Old shared/bookmarked `/p/FFRDBL` URLs still resolve.
 *   3. Lookup logic lives in one place — no scattered drift between
 *      a dozen API routes.
 *
 * RLS narrows the visible terminals to the caller, so this returns
 * whatever the caller is allowed to see, which is the same behaviour
 * the per-route lookups had before centralisation.
 *
 * Returns `null` when no terminal matches (caller should 404).
 */

// Loose `any` because the SSR-cookie and admin Supabase clients have
// slightly different generic shapes and we only touch `.from()`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any;

const TICKER_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

/**
 * If the segment matches the legacy ticker shape (uppercase alnum,
 * 2-10 chars) we try the ticker column too. Lowercase/dashed inputs
 * are assumed to be slugs and skip the ticker probe — saves a
 * round-trip + avoids accidentally matching a slug like "API" against
 * a real "API" ticker on someone else's terminal.
 */
function looksLikeLegacyTicker(segment: string): boolean {
  return TICKER_PATTERN.test(segment);
}

export interface ResolvedTerminal {
  id: string;
  space_id: string;
  slug: string;
  ticker: string;
  name: string;
}

/**
 * Resolve a `/p/<segment>` URL fragment to a terminal row.
 *
 *   - Tries `slug = segment` first (the new common case).
 *   - Falls back to `ticker = segment.toUpperCase()` only when the
 *     segment is shaped like a legacy ticker.
 *   - Selects only the columns most callers need (id, space_id,
 *     slug, ticker, name). If a caller needs more they should run a
 *     follow-up SELECT using the returned `id`.
 */
export async function resolveTerminalBySegment(
  supabase: AnySupabaseClient,
  segment: string,
): Promise<ResolvedTerminal | null> {
  if (!segment) return null;

  // Slug lookup — the common case for any link generated since the
  // 20260526010000_terminal_slug migration shipped.
  {
    const { data } = await supabase
      .from("terminals")
      .select("id, space_id, slug, ticker, name")
      .eq("slug", segment)
      .is("archived_at", null)
      .maybeSingle();
    if (data) return data as ResolvedTerminal;
  }

  // Fallback for shared URLs minted before the slug column existed.
  if (looksLikeLegacyTicker(segment)) {
    const { data } = await supabase
      .from("terminals")
      .select("id, space_id, slug, ticker, name")
      .eq("ticker", segment.toUpperCase())
      .is("archived_at", null)
      .maybeSingle();
    if (data) return data as ResolvedTerminal;
  }

  return null;
}
