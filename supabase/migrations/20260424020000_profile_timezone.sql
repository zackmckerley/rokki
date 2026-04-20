-- Per-user timezone so dashboards and scheduling UI can show teammates'
-- local time. Nullable: we'll auto-detect on first sign-in via the client's
-- Intl.DateTimeFormat().resolvedOptions().timeZone and save to this column.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone TEXT;

COMMENT ON COLUMN profiles.timezone IS
  'IANA timezone (e.g. America/New_York). NULL means "not set"; UI falls back to the viewer''s local tz.';
