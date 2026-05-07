-- Any space member can create terminals.
--
-- Old rule: only owners/admins of a space could create terminals
-- inside it. New rule per Zack: any member of the space can — and
-- when they do, both the creator AND every space owner are
-- auto-added as terminal owners (the creator gets admin control of
-- the new terminal, the space owner stays in the loop without
-- having to be invited).
--
-- Two coordinated changes:
--   1. Replace the `terminals_insert` RLS policy so the membership
--      gate uses `is_space_member` instead of `is_space_admin`.
--   2. New AFTER-INSERT trigger on `terminals` that seeds
--      `terminal_members` with the creator + every space owner,
--      both with role='owner'. The trigger runs SECURITY DEFINER
--      so it bypasses the (still RLS-protected) terminal_members
--      insert policy — we don't want a regular member to be able
--      to forge terminal_members rows on their own.
--
-- The CLAUDE.md permissions section is updated in the same PR to
-- reflect the new model.

BEGIN;

DROP POLICY IF EXISTS "terminals_insert" ON terminals;

CREATE POLICY "terminals_insert" ON terminals FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND is_space_member(space_id)
);

COMMENT ON POLICY "terminals_insert" ON terminals IS
  'Any member of the parent space may create terminals inside it. The trg_terminal_init_members trigger auto-adds the creator and every space owner as terminal owners on insert.';

CREATE OR REPLACE FUNCTION add_terminal_creator_and_space_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Creator → terminal owner. ON CONFLICT guards against a future
  -- code path that already inserts the creator manually.
  INSERT INTO terminal_members (terminal_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by)
  ON CONFLICT (terminal_id, user_id) DO NOTHING;

  -- Every space owner → terminal owner too. The space owner needs
  -- visibility into work happening under their tenant; before this
  -- they relied on the is_space_admin fallback in is_terminal_member
  -- which gave them read access but no actual membership row, so
  -- features keyed on terminal_members (presence, assignment
  -- pickers) skipped them.
  INSERT INTO terminal_members (terminal_id, user_id, role, added_by)
  SELECT NEW.id, sm.user_id, 'owner', NEW.created_by
  FROM space_members sm
  WHERE sm.space_id = NEW.space_id
    AND sm.role = 'owner'
    AND sm.user_id <> NEW.created_by
  ON CONFLICT (terminal_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_terminal_init_members ON terminals;
CREATE TRIGGER trg_terminal_init_members
  AFTER INSERT ON terminals
  FOR EACH ROW EXECUTE FUNCTION add_terminal_creator_and_space_owner();

COMMIT;
