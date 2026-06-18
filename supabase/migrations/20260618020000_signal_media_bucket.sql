-- Storage bucket for Signal attachments (images, documents, any file).
--
-- The bridge uploads received attachments here via the service role (bypasses
-- storage RLS); outbound files the user attaches are uploaded by the web app
-- under the same per-user key prefix. Keys are `<userId>/<threadId>/<name>`.
-- The SELECT policy lets a user sign download URLs for their own media only.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('signal-media', 'signal-media', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "signal_media_owner_read" ON storage.objects;
CREATE POLICY "signal_media_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'signal-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "signal_media_owner_write" ON storage.objects;
CREATE POLICY "signal_media_owner_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'signal-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP POLICY IF EXISTS "signal_media_owner_read" ON storage.objects;
-- DROP POLICY IF EXISTS "signal_media_owner_write" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'signal-media';
-- COMMIT;
