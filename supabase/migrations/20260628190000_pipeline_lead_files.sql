-- Storage bucket for lead attachments (OMs, surveys, photos, any file).
--
-- Private bucket; downloads go through short-lived signed URLs. Keys are
-- `<userId>/<leadId>/<uuid>.<ext>` — owner-prefixed, so the policies below pin
-- every read/write/delete to the uploader. File METADATA (name/size/type/key)
-- lives on the lead in attributes.files; this bucket just holds the bytes.
-- (Solo use today: per-uploader visibility is fine; a shared-lead/team variant
-- would key on space + check space_members.)

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lead-files', 'lead-files', false, 26214400) -- 25 MB
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

DROP POLICY IF EXISTS "lead_files_owner_read" ON storage.objects;
CREATE POLICY "lead_files_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lead-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "lead_files_owner_write" ON storage.objects;
CREATE POLICY "lead_files_owner_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lead-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "lead_files_owner_delete" ON storage.objects;
CREATE POLICY "lead_files_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lead-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP POLICY IF EXISTS "lead_files_owner_delete" ON storage.objects;
-- DROP POLICY IF EXISTS "lead_files_owner_write" ON storage.objects;
-- DROP POLICY IF EXISTS "lead_files_owner_read" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'lead-files';
-- COMMIT;
