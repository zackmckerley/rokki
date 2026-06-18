/**
 * Markets module manifest.
 *
 * A dense, keyboard-first markets terminal — quotes, charts, watchlists,
 * portfolios, market overview, news, calendars, financials, alerts. Backed
 * by free, display-licensed data feeds behind a swappable provider adapter
 * (see `apps/web/src/lib/markets/providers/`).
 *
 * Opt-in (not `enabled_by_default` in `modules_catalog`); installed per
 * scope via the marketplace. Available at all three scopes:
 *   - user     → `/modules/markets`        (your watchlists + portfolios)
 *   - space    → `/s/[slug]/markets`   (shared firm watchlists / comps)
 *   - terminal → `/p/[ticker]/markets` (per-deal public-comp tracking)
 *
 * NOTE: the terminal route uses `[ticker]` — that is the TERMINAL ticker
 * (terminals.ticker), not a stock symbol. Stock symbols live under
 * `/modules/markets/quote/[symbol]`.
 */
import type { ModuleManifest } from "@rokki/sdk";

export const marketsManifest: ModuleManifest = {
  slug: "markets",
  name: "Markets",
  description:
    "Real-time quotes, charts, watchlists, portfolios, and market news — a keyboard-first markets terminal.",
  icon: "trending-up",
  scopes: ["user", "space", "terminal"],
  vertical: null,
  routes: {
    user: "/modules/markets",
    space: "/s/[slug]/markets",
    terminal: "/p/[ticker]/markets",
  },
  fnKey: { label: "Markets", default: 6 },
};
