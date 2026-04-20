-- Session revocation fan-out.
--
-- When a user loses access to something (kicked from a terminal, removed
-- from a space, token revoked), we INSERT a row here targeting their
-- auth user_id. The client app subscribes to postgres_changes on this
-- table filtered by `user_id = auth.uid()`, and when a row arrives it
-- calls `supabase.auth.signOut()` + redirects to /login.
--
-- This gets us the "revoke within 30s" target in 08_UI_DESIGN / 11.3.6
-- without depending on Supabase auth's refresh-token expiry, which is
-- typically 1h+. We can live with Postgres-row-driven logout; the user
-- gets a clean "session ended" screen instead of a 403 mid-action.

CREATE TABLE session_revocations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN (
    'terminal_member_removed',
    'space_member_removed',
    'token_revoked',
    'admin_action'
  )),
  scope_type TEXT,      -- 'terminal' | 'space' | 'token' | null
  scope_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_session_revocations_user_time
  ON session_revocations(user_id, created_at DESC);

ALTER TABLE session_revocations ENABLE ROW LEVEL SECURITY;

-- Users can read their own revocations (needed for the realtime
-- subscription to deliver events to them).
CREATE POLICY "session_revocations_self_select" ON session_revocations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Writes are service-role only.

ALTER PUBLICATION supabase_realtime ADD TABLE session_revocations;

-- ----------------------------------------------------------------------------
-- Prune: expire revocation rows after 7 days. A cron job calls this;
-- we keep them long enough for audit but they don't belong long-term.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.session_revocations_prune()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted INT;
BEGIN
  DELETE FROM session_revocations
  WHERE created_at < now() - INTERVAL '7 days';
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END $$;
