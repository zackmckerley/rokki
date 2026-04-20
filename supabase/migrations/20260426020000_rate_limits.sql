-- Postgres-backed rate limiter. Small and boring — one row per hit, a single
-- COUNT query per check, a cron job to expire old rows. Avoids pulling in
-- Upstash/Redis before we actually need it.
--
-- Usage (server-side only — never call from the browser):
--   SELECT public.rate_limit_check('magic_link', '10.0.0.1', 5, 60);
--     -> true if the caller is under the cap, false if over.
--
-- `bucket` groups hits (magic_link, password_reset, etc.).
-- `token` is whatever you key on (IP, email, user_id).

CREATE TABLE rate_limit_hits (
  id BIGSERIAL PRIMARY KEY,
  bucket TEXT NOT NULL,
  token TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The check is always (bucket, token, ts > cutoff); index for exactly that.
CREATE INDEX idx_rate_limit_hits_lookup
  ON rate_limit_hits (bucket, token, ts DESC);

ALTER TABLE rate_limit_hits ENABLE ROW LEVEL SECURITY;

-- No policies. Only service-role reads/writes — users never touch this table.

-- ----------------------------------------------------------------------------
-- rate_limit_check(bucket, token, max_hits, window_seconds)
-- Atomically records a hit and returns whether the caller is still under cap.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rate_limit_check(
  _bucket TEXT,
  _token TEXT,
  _max_hits INT,
  _window_seconds INT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hits INT;
BEGIN
  -- Count existing hits in window first — if over, don't record another.
  SELECT COUNT(*) INTO _hits
  FROM rate_limit_hits
  WHERE bucket = _bucket
    AND token = _token
    AND ts > now() - make_interval(secs => _window_seconds);

  IF _hits >= _max_hits THEN
    RETURN FALSE;
  END IF;

  INSERT INTO rate_limit_hits (bucket, token) VALUES (_bucket, _token);
  RETURN TRUE;
END $$;

-- ----------------------------------------------------------------------------
-- Cleanup: any row older than 24h is free to delete. Call from the indexer
-- cron (which already runs) rather than pg_cron to avoid the extension dep.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rate_limit_cleanup()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted INT;
BEGIN
  DELETE FROM rate_limit_hits
  WHERE ts < now() - INTERVAL '24 hours';
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END $$;

COMMENT ON FUNCTION public.rate_limit_check IS
  'Sliding-window rate limit. Returns true if the caller may proceed, false if over cap. Records a hit on success.';
