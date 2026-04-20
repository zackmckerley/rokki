-- External share links for files.
--
-- Use case: PE diligence, legal opposing counsel, a contractor who isn't
-- a Rokki user. The link holder exchanges an opaque token for a time-
-- limited signed download URL — we never hand over the blob_key itself.
--
-- Each view and download lands in share_link_accesses for an audit trail.

CREATE TABLE share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  -- Opaque token the URL contains. 32 bytes of entropy, base64url. Stored
  -- in the clear for fast lookup; rotating = revoking + reissuing.
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  max_views INT,
  revoked_at TIMESTAMPTZ,
  require_email BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_share_links_file ON share_links(file_id)
  WHERE revoked_at IS NULL;

CREATE TABLE share_link_accesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES share_links(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind TEXT NOT NULL CHECK (kind IN ('view', 'download')),
  viewer_email TEXT,
  viewer_ip INET,
  viewer_ua TEXT
);

CREATE INDEX idx_share_link_accesses_link ON share_link_accesses(share_link_id, viewed_at DESC);

ALTER TABLE share_links          ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_link_accesses  ENABLE ROW LEVEL SECURITY;

-- RLS: the creator (or a manager of the file's terminal) can manage the
-- link. Public exchange happens via a service-role RPC.
CREATE POLICY "share_links_select" ON share_links
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM files f
      WHERE f.id = share_links.file_id AND is_terminal_manager(f.terminal_id)
    )
  );

CREATE POLICY "share_links_insert" ON share_links
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM files f
      WHERE f.id = share_links.file_id AND is_terminal_member(f.terminal_id)
    )
  );

CREATE POLICY "share_links_update" ON share_links
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM files f
      WHERE f.id = share_links.file_id AND is_terminal_manager(f.terminal_id)
    )
  );

CREATE POLICY "share_links_delete" ON share_links
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM files f
      WHERE f.id = share_links.file_id AND is_terminal_manager(f.terminal_id)
    )
  );

-- Accesses are read-only to link owner + terminal managers.
CREATE POLICY "share_link_accesses_select" ON share_link_accesses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM share_links sl
      WHERE sl.id = share_link_accesses.share_link_id
        AND (
          sl.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM files f
            WHERE f.id = sl.file_id AND is_terminal_manager(f.terminal_id)
          )
        )
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE share_links;
ALTER PUBLICATION supabase_realtime ADD TABLE share_link_accesses;
