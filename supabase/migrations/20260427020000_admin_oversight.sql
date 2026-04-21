-- Wave-2 admin oversight schema:
--   emergency_access_events: rename FKs (org→space, project→terminal),
--                            add active_until + revoked_at + revoked_by
--   impersonation_events:    audit who-as-who and for how long
--   tools.moderation:        admin-only flags layered on top of `visibility`

-- ----------------------------------------------------------------------------
-- emergency_access_events
-- ----------------------------------------------------------------------------
ALTER TABLE emergency_access_events
  ADD COLUMN IF NOT EXISTS target_space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS target_terminal_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS active_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill from the legacy column names.
UPDATE emergency_access_events
SET target_space_id = COALESCE(target_space_id, target_org_id)
WHERE target_space_id IS NULL AND target_org_id IS NOT NULL;
UPDATE emergency_access_events
SET target_terminal_id = COALESCE(target_terminal_id, target_project_id)
WHERE target_terminal_id IS NULL AND target_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_emergency_active
  ON emergency_access_events(active_until)
  WHERE active_until IS NOT NULL AND revoked_at IS NULL;

ALTER TABLE emergency_access_events ENABLE ROW LEVEL SECURITY;

-- Platform admins read everything; the user being shadowed can see their own
-- grants for transparency.
DROP POLICY IF EXISTS "ee_admin_select" ON emergency_access_events;
CREATE POLICY "ee_admin_select" ON emergency_access_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
    OR target_user_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- impersonation_events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS impersonation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  justification TEXT NOT NULL CHECK (char_length(justification) BETWEEN 10 AND 1000),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_impersonation_admin
  ON impersonation_events(admin_user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_impersonation_target
  ON impersonation_events(target_user_id, started_at DESC);

ALTER TABLE impersonation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "imp_admin_select" ON impersonation_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
    OR target_user_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- tools.moderation_status
--
-- A separate column from `visibility` so the admin can disable a tool
-- regardless of who its owner thinks should see it. `featured` is a
-- promotional flag we surface in /tools.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'tool_moderation'
  ) THEN
    CREATE TYPE tool_moderation AS ENUM ('approved', 'pending', 'disabled', 'featured');
  END IF;
END $$;

ALTER TABLE tools
  ADD COLUMN IF NOT EXISTS moderation_status tool_moderation NOT NULL DEFAULT 'approved';

CREATE INDEX IF NOT EXISTS idx_tools_moderation
  ON tools(moderation_status)
  WHERE deleted_at IS NULL;
