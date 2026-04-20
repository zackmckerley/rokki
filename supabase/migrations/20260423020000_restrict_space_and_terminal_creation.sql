-- Locked-down permission model per product:
--
--   Spaces (tenants like "Helios Inc" or "McKerley Family"):
--     only a platform admin can create. Everyone else joins by invite.
--
--   Terminals (a specific project / matter / client / goal):
--     only an owner or admin of the parent space can create.
--     Regular space members can still be invited to specific terminals.
--
--   Tasks inside a terminal:
--     any member of that terminal can create (no change, already correct).

-- Drop and recreate the two policies with stricter WITH CHECK clauses.

DROP POLICY IF EXISTS "orgs_insert" ON spaces;
DROP POLICY IF EXISTS "spaces_insert" ON spaces;

CREATE POLICY "spaces_insert" ON spaces FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = auth.uid()
      AND is_platform_admin = true
  )
);

DROP POLICY IF EXISTS "projects_insert" ON terminals;
DROP POLICY IF EXISTS "terminals_insert" ON terminals;

CREATE POLICY "terminals_insert" ON terminals FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND is_space_admin(space_id)
);

-- Document the policies so the next developer sees intent in psql \d+.
COMMENT ON POLICY "spaces_insert" ON spaces IS
  'Only platform admins (profiles.is_platform_admin) may create spaces.';
COMMENT ON POLICY "terminals_insert" ON terminals IS
  'Only owners/admins of the parent space may create terminals inside it.';
