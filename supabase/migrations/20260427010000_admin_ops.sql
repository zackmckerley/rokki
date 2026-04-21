-- Wave-1 admin ops support:
--   admin_notes              — free-text notes an admin can attach to a user
--   spaces.archived_at       — soft-archive flag (matches terminals.archived_at)
--
-- Kept narrow: nothing here ships user-visible features.

ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS description TEXT
    CHECK (description IS NULL OR char_length(description) <= 1000);

CREATE INDEX IF NOT EXISTS idx_spaces_active
  ON spaces(id) WHERE archived_at IS NULL;

COMMENT ON COLUMN spaces.archived_at IS
  'Soft-archive marker. Set by admin endpoints; null = active.';
COMMENT ON COLUMN spaces.description IS
  'Plain-text description shown in admin space detail and the space landing.';

CREATE TABLE admin_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_notes_target_time ON admin_notes(target_user_id, created_at DESC);

ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;

-- Only platform admins may read or write.
CREATE POLICY "admin_notes_admin_select" ON admin_notes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  );

CREATE POLICY "admin_notes_admin_write" ON admin_notes
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  );
