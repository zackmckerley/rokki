-- RAG pipeline support.
--
-- 1. Track per-file index status on the files row itself (cheaper than
--    LEFT JOINs against file_chunks on every poll).
-- 2. Partial index lets the indexer worker find "files that need work" in
--    O(log n).
-- 3. Generated tsvector column on file_chunks.content gives us free FTS
--    so we can answer queries even when OPENAI_API_KEY isn't set (no vector
--    embeddings), and can hybrid-rank vector + FTS once it is.

ALTER TABLE files
  ADD COLUMN IF NOT EXISTS indexed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS index_error TEXT;

-- Pending-index queue. We only want un-trashed files whose virus scan has
-- either succeeded or been skipped (dev / small files), and which haven't
-- been indexed yet. Partial index ensures this query is a constant-time
-- index lookup regardless of total file count.
CREATE INDEX IF NOT EXISTS idx_files_pending_index
  ON files(uploaded_at)
  WHERE indexed_at IS NULL
    AND deleted_at IS NULL
    AND virus_scan_status IN ('clean', 'skipped');

-- FTS helper on chunk content. Generated column keeps it in sync automatically.
ALTER TABLE file_chunks
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_file_chunks_content_fts
  ON file_chunks USING gin (content_tsv);

COMMENT ON COLUMN files.indexed_at IS
  'Set when the indexer has chunked + (optionally) embedded this file. NULL means pending.';
COMMENT ON COLUMN files.index_error IS
  'Last error message from the indexer, if the pipeline failed on this file.';
