-- Dedicated preferences column on profiles so settings UI reads/writes a
-- typed shape instead of the catch-all `settings` jsonb. Kept separate
-- from `settings` so experimental flags don't mingle with durable prefs.
--
-- Shape:
--   {
--     "density": "cozy" | "compact",
--     "notifications": {
--        "digest_frequency": "instant" | "daily" | "off",
--        "quiet_hours": { "start": "22:00", "end": "07:00" } | null,
--        "kinds": { "mention": true, "assigned": true, "invite": true, "comment_reply": true, "system": true }
--     }
--   }

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN profiles.preferences IS
  'User preferences (density, notification routing). Typed JSON; see /v1/me.';

-- Migrate legacy density from settings -> preferences so existing users
-- keep their choice.
UPDATE profiles
SET preferences = jsonb_set(
  COALESCE(preferences, '{}'::jsonb),
  '{density}',
  to_jsonb(settings->'density')
)
WHERE settings ? 'density' AND NOT (preferences ? 'density');
