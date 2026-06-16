-- Markets module — quotes, watchlists, portfolios, and price alerts.
--
-- Adds the data layer for the "markets" module (essentially-Yahoo-Finance):
-- a public instrument/quote cache (filled server-side from free, display-
-- licensed feeds), plus tenant-scoped watchlists, portfolios with lot-level
-- holdings, and personal price alerts. Everything is RLS-gated to
-- space/terminal membership (or the owning user) per rokki/CLAUDE.md.
--
-- See docs/01_DATA_MODEL.md §1.X and Claude/rokki-markets/MARKETS_MODULE_PLAN.md.
--
-- NOTE: "symbol" (e.g. AAPL) is a STOCK identifier and is intentionally
-- distinct from a terminal "ticker" (terminals.ticker). Never conflate them.

BEGIN;

-- ───────────────────────────────────────────────────────────────────
-- mkt_instruments — reference cache for symbol search/autocomplete.
-- Public market data (not tenant data): readable by any authenticated
-- user; written only by the server-side fetch layer (service role).
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE mkt_instruments (
  symbol     TEXT PRIMARY KEY,
  name       TEXT NOT NULL DEFAULT '',
  exchange   TEXT,
  type       TEXT NOT NULL DEFAULT 'stock'
               CHECK (type IN ('stock','etf','crypto','fx','index','future','bond','unknown')),
  currency   TEXT NOT NULL DEFAULT 'USD',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mkt_instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mkt_instruments_read" ON mkt_instruments
  FOR SELECT TO authenticated USING (TRUE);

-- ───────────────────────────────────────────────────────────────────
-- mkt_quote_cache — durable, server-managed quote cache. TTL is enforced
-- in app code (lib/markets/cache.ts); this table is the source of truth
-- the UI subscribes to via Supabase Realtime so watchlist rows update
-- live without client-side polling.
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE mkt_quote_cache (
  symbol     TEXT PRIMARY KEY,
  payload    JSONB NOT NULL,            -- normalized Quote (see providers/types.ts)
  provider   TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mkt_quote_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mkt_quote_cache_read" ON mkt_quote_cache
  FOR SELECT TO authenticated USING (TRUE);

-- Realtime: publish quote updates so subscribed panes update live.
ALTER TABLE mkt_quote_cache REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE mkt_quote_cache;

-- ───────────────────────────────────────────────────────────────────
-- mkt_watchlists — scope-polymorphic (exactly one of user/space/terminal).
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE mkt_watchlists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  space_id      UUID REFERENCES spaces(id) ON DELETE CASCADE,
  terminal_id   UUID REFERENCES terminals(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  display_order INT NOT NULL DEFAULT 0,
  created_by    UUID NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at   TIMESTAMPTZ,
  CONSTRAINT mkt_watchlists_one_scope CHECK (
    (user_id IS NOT NULL)::int
  + (space_id IS NOT NULL)::int
  + (terminal_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX idx_mkt_watchlists_user     ON mkt_watchlists(user_id)     WHERE archived_at IS NULL;
CREATE INDEX idx_mkt_watchlists_space    ON mkt_watchlists(space_id)    WHERE archived_at IS NULL;
CREATE INDEX idx_mkt_watchlists_terminal ON mkt_watchlists(terminal_id) WHERE archived_at IS NULL;

ALTER TABLE mkt_watchlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mkt_watchlists_read" ON mkt_watchlists
  FOR SELECT TO authenticated USING (
    (user_id = auth.uid())
    OR (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()))
    OR (terminal_id IN (SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid()))
  );

CREATE POLICY "mkt_watchlists_write" ON mkt_watchlists
  FOR ALL TO authenticated
  USING (
    (user_id = auth.uid())
    OR (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()))
    OR (terminal_id IN (SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    (user_id = auth.uid())
    OR (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()))
    OR (terminal_id IN (SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid()))
  );

-- ───────────────────────────────────────────────────────────────────
-- mkt_watchlist_symbols — members inherit visibility from the watchlist.
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE mkt_watchlist_symbols (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id  UUID NOT NULL REFERENCES mkt_watchlists(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  note          TEXT CHECK (note IS NULL OR char_length(note) <= 280),
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (watchlist_id, symbol)
);

CREATE INDEX idx_mkt_watchlist_symbols_wl ON mkt_watchlist_symbols(watchlist_id);

ALTER TABLE mkt_watchlist_symbols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mkt_watchlist_symbols_read" ON mkt_watchlist_symbols
  FOR SELECT TO authenticated USING (
    watchlist_id IN (SELECT id FROM mkt_watchlists)
  );

CREATE POLICY "mkt_watchlist_symbols_write" ON mkt_watchlist_symbols
  FOR ALL TO authenticated
  USING (watchlist_id IN (SELECT id FROM mkt_watchlists))
  WITH CHECK (watchlist_id IN (SELECT id FROM mkt_watchlists));

-- ───────────────────────────────────────────────────────────────────
-- mkt_portfolios — scope-polymorphic, like watchlists.
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE mkt_portfolios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  space_id      UUID REFERENCES spaces(id) ON DELETE CASCADE,
  terminal_id   UUID REFERENCES terminals(id) ON DELETE CASCADE,
  name          TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  base_currency TEXT NOT NULL DEFAULT 'USD',
  created_by    UUID NOT NULL REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at   TIMESTAMPTZ,
  CONSTRAINT mkt_portfolios_one_scope CHECK (
    (user_id IS NOT NULL)::int
  + (space_id IS NOT NULL)::int
  + (terminal_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX idx_mkt_portfolios_user     ON mkt_portfolios(user_id)     WHERE archived_at IS NULL;
CREATE INDEX idx_mkt_portfolios_space    ON mkt_portfolios(space_id)    WHERE archived_at IS NULL;
CREATE INDEX idx_mkt_portfolios_terminal ON mkt_portfolios(terminal_id) WHERE archived_at IS NULL;

ALTER TABLE mkt_portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mkt_portfolios_read" ON mkt_portfolios
  FOR SELECT TO authenticated USING (
    (user_id = auth.uid())
    OR (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()))
    OR (terminal_id IN (SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid()))
  );

CREATE POLICY "mkt_portfolios_write" ON mkt_portfolios
  FOR ALL TO authenticated
  USING (
    (user_id = auth.uid())
    OR (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()))
    OR (terminal_id IN (SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid()))
  )
  WITH CHECK (
    (user_id = auth.uid())
    OR (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()))
    OR (terminal_id IN (SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid()))
  );

-- ───────────────────────────────────────────────────────────────────
-- mkt_lots — lot-level holdings; inherit visibility from the portfolio.
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE mkt_lots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES mkt_portfolios(id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL,
  side         TEXT NOT NULL CHECK (side IN ('buy','sell')),
  quantity     NUMERIC NOT NULL CHECK (quantity > 0),
  price        NUMERIC NOT NULL CHECK (price >= 0),   -- per share, trade currency
  fees         NUMERIC NOT NULL DEFAULT 0 CHECK (fees >= 0),
  trade_date   DATE NOT NULL,
  note         TEXT CHECK (note IS NULL OR char_length(note) <= 280),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_lots_portfolio ON mkt_lots(portfolio_id);

ALTER TABLE mkt_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mkt_lots_read" ON mkt_lots
  FOR SELECT TO authenticated USING (
    portfolio_id IN (SELECT id FROM mkt_portfolios)
  );

CREATE POLICY "mkt_lots_write" ON mkt_lots
  FOR ALL TO authenticated
  USING (portfolio_id IN (SELECT id FROM mkt_portfolios))
  WITH CHECK (portfolio_id IN (SELECT id FROM mkt_portfolios));

-- ───────────────────────────────────────────────────────────────────
-- mkt_alerts — strictly personal price/percent alerts.
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE mkt_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  condition         TEXT NOT NULL CHECK (condition IN ('price_above','price_below','pct_up','pct_down')),
  threshold         NUMERIC NOT NULL,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  note              TEXT CHECK (note IS NULL OR char_length(note) <= 280),
  last_triggered_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mkt_alerts_active ON mkt_alerts(symbol) WHERE active;
CREATE INDEX idx_mkt_alerts_user   ON mkt_alerts(user_id);

ALTER TABLE mkt_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mkt_alerts_own" ON mkt_alerts
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────
-- Catalog seed — surface "markets" in the module marketplace. Opt-in
-- (enabled_by_default = FALSE), available at all three scopes.
-- ───────────────────────────────────────────────────────────────────

INSERT INTO modules_catalog (slug, name, description, icon, scopes, enabled_by_default) VALUES
  ('markets', 'Markets',
   'Real-time quotes, charts, watchlists, portfolios, and market news.',
   'trending-up', ARRAY['user','space','terminal'], FALSE);

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DELETE FROM modules_catalog WHERE slug = 'markets';
-- ALTER PUBLICATION supabase_realtime DROP TABLE mkt_quote_cache;
-- DROP TABLE IF EXISTS mkt_alerts CASCADE;
-- DROP TABLE IF EXISTS mkt_lots CASCADE;
-- DROP TABLE IF EXISTS mkt_portfolios CASCADE;
-- DROP TABLE IF EXISTS mkt_watchlist_symbols CASCADE;
-- DROP TABLE IF EXISTS mkt_watchlists CASCADE;
-- DROP TABLE IF EXISTS mkt_quote_cache CASCADE;
-- DROP TABLE IF EXISTS mkt_instruments CASCADE;
-- COMMIT;
