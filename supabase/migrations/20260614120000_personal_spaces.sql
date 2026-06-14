-- Personal Space — every user gets exactly one private "Personal" space.
--
-- A personal space is an ordinary `spaces` row flagged is_personal=true with a
-- single owner (personal_owner_id). It is auto-provisioned at signup and
-- backfilled for existing users. It behaves like any space — the owner can
-- create terminals, tasks, files, and comments inside it — but:
--   * exactly one per user                    (partial unique index)
--   * the owner is the sole member; nobody else can ever be added   (RLS)
--   * it can't be deleted, so the dashboard always has a home        (RLS)
--   * only the owner sees it; platform admins reach it EXACTLY the way they
--     reach every other space (has_emergency_access break-glass /
--     service-role admin routes) — no special-casing, so admins see personal
--     spaces "like the others".
--
-- Provisioning runs inside the existing SECURITY DEFINER handle_new_user()
-- trigger so it bypasses the platform-admin-only `spaces_insert` policy (the
-- same pattern the codebase already uses for the profiles row). The existing
-- AFTER INSERT ON spaces trigger (trg_space_creator -> add_space_creator_as_owner)
-- seeds the owner's space_members row automatically, so this migration never
-- touches space_members directly during provisioning.

BEGIN;

-- 1. Columns ----------------------------------------------------------------

ALTER TABLE spaces
  ADD COLUMN is_personal BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN personal_owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- A personal space names its owner; a shared space never does. Keeps the two
-- columns consistent and gives the unique index below its "one per user"
-- meaning. Existing rows (is_personal=false, personal_owner_id=null) pass.
ALTER TABLE spaces ADD CONSTRAINT spaces_personal_owner_consistency CHECK (
  (is_personal AND personal_owner_id IS NOT NULL)
  OR (NOT is_personal AND personal_owner_id IS NULL)
);

-- Exactly one personal space per user.
CREATE UNIQUE INDEX spaces_personal_owner_key
  ON spaces (personal_owner_id)
  WHERE is_personal;

-- 2. Provisioning helper ----------------------------------------------------
-- Idempotent: returns the user's existing personal space if they already have
-- one, otherwise creates it. SECURITY DEFINER so it bypasses the admin-only
-- spaces_insert RLS. The slug must satisfy the spaces CHECK
-- (^[a-z][a-z0-9-]{1,38}[a-z0-9]$, length 3-40): 'p' + the 32 hex chars of the
-- user id = 33 chars, starts with a letter, ends alphanumeric, globally
-- unique. The slug is never shown — the display name is "Personal".

CREATE OR REPLACE FUNCTION provision_personal_space(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_space_id UUID;
BEGIN
  SELECT id INTO v_space_id
  FROM spaces
  WHERE is_personal AND personal_owner_id = p_user_id;

  IF v_space_id IS NOT NULL THEN
    RETURN v_space_id;
  END IF;

  INSERT INTO spaces (slug, name, created_by, is_personal, personal_owner_id)
  VALUES (
    'p' || replace(p_user_id::text, '-', ''),
    'Personal',
    p_user_id,
    TRUE,
    p_user_id
  )
  RETURNING id INTO v_space_id;

  RETURN v_space_id;
END;
$$;

GRANT EXECUTE ON FUNCTION provision_personal_space(UUID) TO authenticated, service_role;

-- 3. Auto-provision on signup ----------------------------------------------
-- Extend handle_new_user to give every new user their personal space. The
-- profiles insert is kept verbatim from 20260419121000; we only append the
-- space provisioning.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Give every new user their private Personal space.
  PERFORM provision_personal_space(NEW.id);

  RETURN NEW;
END;
$$;

-- 4. No invites to a personal space ----------------------------------------
-- A personal space is owner-only. The provisioning trigger seeds the owner
-- (SECURITY DEFINER, bypasses RLS), but no one — not even the owner — can add
-- a second member through normal RLS. Shared spaces are unaffected. This
-- replaces the org_members_insert policy (renamed cleanly to
-- space_members_insert while we're here).

DROP POLICY IF EXISTS "org_members_insert" ON space_members;
CREATE POLICY "space_members_insert" ON space_members FOR INSERT TO authenticated
WITH CHECK (
  is_space_admin(space_id)
  AND NOT EXISTS (
    SELECT 1 FROM spaces s WHERE s.id = space_id AND s.is_personal
  )
);

-- 5. A personal space can't be deleted -------------------------------------
-- Undeletable so the user always has a home. Shared-space owner-delete is
-- unchanged (renamed cleanly orgs_delete -> spaces_delete).

DROP POLICY IF EXISTS "orgs_delete" ON spaces;
CREATE POLICY "spaces_delete" ON spaces FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM space_members
    WHERE space_id = spaces.id AND user_id = auth.uid() AND role = 'owner'
  )
  AND NOT is_personal
);

-- 6. Backfill ---------------------------------------------------------------
-- Every existing user gets a personal space (idempotent via the helper). On a
-- fresh `supabase db reset` auth.users is empty here, so this is a no-op and
-- the seed users get provisioned by the trigger when they're inserted. On
-- staging/prod (db push against a populated database) this gives every
-- existing user their Personal space.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM auth.users LOOP
    PERFORM provision_personal_space(r.id);
  END LOOP;
END $$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP POLICY IF EXISTS "spaces_delete" ON spaces;
-- CREATE POLICY "orgs_delete" ON spaces FOR DELETE TO authenticated
--   USING (EXISTS (SELECT 1 FROM space_members WHERE space_id = spaces.id AND user_id = auth.uid() AND role = 'owner'));
-- DROP POLICY IF EXISTS "space_members_insert" ON space_members;
-- CREATE POLICY "org_members_insert" ON space_members FOR INSERT TO authenticated
--   WITH CHECK (is_space_admin(space_id));
-- CREATE OR REPLACE FUNCTION public.handle_new_user()
-- RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $func$
-- BEGIN
--   INSERT INTO public.profiles (user_id, full_name)
--   VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
--   ON CONFLICT (user_id) DO NOTHING;
--   RETURN NEW;
-- END;
-- $func$;
-- DELETE FROM spaces WHERE is_personal;
-- DROP FUNCTION IF EXISTS provision_personal_space(UUID);
-- DROP INDEX IF EXISTS spaces_personal_owner_key;
-- ALTER TABLE spaces DROP CONSTRAINT IF EXISTS spaces_personal_owner_consistency;
-- ALTER TABLE spaces DROP COLUMN IF EXISTS personal_owner_id;
-- ALTER TABLE spaces DROP COLUMN IF EXISTS is_personal;
-- COMMIT;
