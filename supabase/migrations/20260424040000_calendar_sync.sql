-- External calendar sync.
--
-- Each user can connect multiple calendars from supported providers
-- (Google, Microsoft). OAuth tokens are stored encrypted (AES-256-GCM)
-- with a global master key; we keep ciphertext + iv + auth-tag split so a
-- future move to envelope encryption / KMS rotates cleanly.
--
-- Events sync runs every INDEXER_CALENDAR_POLL_MS from the indexer,
-- upserting into calendar_events keyed by (connection_id, external_id).

CREATE TABLE calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
  account_email TEXT NOT NULL,
  -- Encrypted refresh + access tokens. Keep both: refresh is long-lived,
  -- access is short-lived and refreshed on demand by the worker.
  access_token_ciphertext TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  access_token_tag TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ,
  refresh_token_ciphertext TEXT,
  refresh_token_iv TEXT,
  refresh_token_tag TEXT,
  -- For Microsoft we need the tenant id; for Google it's not needed.
  external_account_id TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  last_sync_at TIMESTAMPTZ,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  UNIQUE (user_id, provider, account_email)
);

CREATE INDEX idx_calendar_connections_pending_sync
  ON calendar_connections(last_sync_at NULLS FIRST)
  WHERE revoked_at IS NULL;

CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  -- Remote identifier from the provider. (connection_id, external_id) is unique.
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  -- Where this event lives in the provider's calendar.
  source_calendar TEXT,
  html_link TEXT,
  -- Optional attachment to a Rokki terminal once the user tags it.
  terminal_id UUID REFERENCES terminals(id) ON DELETE SET NULL,
  raw JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (connection_id, external_id)
);

CREATE INDEX idx_calendar_events_user_week
  ON calendar_events(connection_id, starts_at)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_calendar_events_terminal
  ON calendar_events(terminal_id)
  WHERE terminal_id IS NOT NULL AND deleted_at IS NULL;

-- RLS ---------------------------------------------------------------------

ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_events      ENABLE ROW LEVEL SECURITY;

-- Users see only their own connections.
CREATE POLICY "calendar_connections_own" ON calendar_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Events: visible when I own the connection.
CREATE POLICY "calendar_events_select" ON calendar_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM calendar_connections cc
      WHERE cc.id = calendar_events.connection_id
        AND cc.user_id = auth.uid()
    )
  );

-- Inserts/updates from the indexer go through the service role, which
-- bypasses RLS. Individual users can still patch their own events (e.g. to
-- attach a terminal_id) but cannot insert new ones directly.
CREATE POLICY "calendar_events_update_own" ON calendar_events
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM calendar_connections cc
      WHERE cc.id = calendar_events.connection_id
        AND cc.user_id = auth.uid()
    )
  );

-- Publish for live updates when the worker finishes a sync.
ALTER PUBLICATION supabase_realtime ADD TABLE calendar_connections;
ALTER PUBLICATION supabase_realtime ADD TABLE calendar_events;
