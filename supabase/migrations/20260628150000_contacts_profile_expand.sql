-- Contacts profile build-out: richer person data + an avatar image store.
--
-- The contacts table already carries emails/phones/addresses/socials as JSONB
-- arrays (so "multiple of each" needs no schema change — just UI). This adds the
-- genuinely new fields and renames firm → company per product feedback:
--   - firm  → company   (the org a person is affiliated with)
--   - birthday DATE      (nullable)
--   - family   JSONB     ([{name, relation}] — relatives to remember)
-- Plus a public `contact-avatars` storage bucket for profile pictures, modeled
-- on signal-media (20260618020000): owner-prefixed keys, owner-only writes.
--
-- The module is days old and user-scope only (no shared/prod data depends on the
-- `firm` name), so the rename is clean. RLS for the new columns is inherited
-- from the existing owner-scoped contacts policies — no policy change needed.

BEGIN;

ALTER TABLE contacts RENAME COLUMN firm TO company;
ALTER TABLE contacts ADD COLUMN birthday DATE;
ALTER TABLE contacts ADD COLUMN family JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ───────────────────────────────────────────────────────────────────
-- contact-avatars storage bucket (public read; owner-only writes).
-- Public so a plain <img src> renders in lists/detail without signing each
-- URL. Keys are `<userId>/<uuid>.<ext>` — unguessable + owner-prefixed, so the
-- write policies below pin every mutation to its owner.
-- ───────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('contact-avatars', 'contact-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "contact_avatars_owner_write" ON storage.objects;
CREATE POLICY "contact_avatars_owner_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'contact-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "contact_avatars_owner_update" ON storage.objects;
CREATE POLICY "contact_avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'contact-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "contact_avatars_owner_delete" ON storage.objects;
CREATE POLICY "contact_avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'contact-avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP POLICY IF EXISTS "contact_avatars_owner_delete" ON storage.objects;
-- DROP POLICY IF EXISTS "contact_avatars_owner_update" ON storage.objects;
-- DROP POLICY IF EXISTS "contact_avatars_owner_write" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'contact-avatars';
-- ALTER TABLE contacts DROP COLUMN family;
-- ALTER TABLE contacts DROP COLUMN birthday;
-- ALTER TABLE contacts RENAME COLUMN company TO firm;
-- COMMIT;
