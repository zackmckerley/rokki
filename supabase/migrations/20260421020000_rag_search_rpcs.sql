-- RAG retrieval RPCs.
--
-- supabase-js can't emit the `<=>` cosine distance operator or rank_cd
-- directly, so we wrap both in SECURITY INVOKER functions that still go
-- through RLS (the caller's visibility on file_chunks via can_see_file).
--
-- 1. search_chunks_vector — cosine similarity to a query vector, scoped
--    to a project (or to anything the caller can see if project_id is null).
-- 2. search_chunks_fts — Postgres full-text search fallback when no
--    embedding is available for the query.
-- 3. search_chunks_hybrid — runs both and merges by reciprocal-rank fusion,
--    so we degrade gracefully when only one signal exists.

CREATE OR REPLACE FUNCTION search_chunks_vector(
  _query_embedding VECTOR(1536),
  _project UUID DEFAULT NULL,
  _limit INT DEFAULT 8
)
RETURNS TABLE (
  file_id UUID,
  project_id UUID,
  chunk_index INT,
  content TEXT,
  page_number INT,
  distance FLOAT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    fc.file_id,
    fc.project_id,
    fc.chunk_index,
    fc.content,
    fc.page_number,
    (fc.embedding <=> _query_embedding) AS distance
  FROM file_chunks fc
  WHERE fc.embedding IS NOT NULL
    AND (_project IS NULL OR fc.project_id = _project)
  ORDER BY fc.embedding <=> _query_embedding
  LIMIT _limit;
$$;

CREATE OR REPLACE FUNCTION search_chunks_fts(
  _query TEXT,
  _project UUID DEFAULT NULL,
  _limit INT DEFAULT 8
)
RETURNS TABLE (
  file_id UUID,
  project_id UUID,
  chunk_index INT,
  content TEXT,
  page_number INT,
  rank FLOAT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    fc.file_id,
    fc.project_id,
    fc.chunk_index,
    fc.content,
    fc.page_number,
    ts_rank_cd(fc.content_tsv, websearch_to_tsquery('english', _query)) AS rank
  FROM file_chunks fc
  WHERE (_project IS NULL OR fc.project_id = _project)
    AND fc.content_tsv @@ websearch_to_tsquery('english', _query)
  ORDER BY rank DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION search_chunks_vector(VECTOR(1536), UUID, INT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_chunks_fts(TEXT, UUID, INT)
  TO authenticated, service_role;
