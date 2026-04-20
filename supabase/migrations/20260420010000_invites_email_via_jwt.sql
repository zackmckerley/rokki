-- The original invites RLS policy read the caller's email from auth.users
-- via a subquery, but Supabase's `authenticated` role has no SELECT grant on
-- auth.users, producing "permission denied for table users" when invitees
-- try to query their own pending invites.
--
-- Fix: read the email from the JWT claims directly with auth.jwt()->>'email'.
-- Same behavior, no auth.users access needed.

DROP POLICY IF EXISTS "invites_select" ON invites;
CREATE POLICY "invites_select" ON invites FOR SELECT TO authenticated
USING (
  invited_by = auth.uid()
  OR email = ((auth.jwt() ->> 'email')::citext)
);

DROP POLICY IF EXISTS "invites_update" ON invites;
CREATE POLICY "invites_update" ON invites FOR UPDATE TO authenticated
USING (email = ((auth.jwt() ->> 'email')::citext));

-- ROLLBACK:
-- Restore the auth.users-based subquery versions from the initial migration.
