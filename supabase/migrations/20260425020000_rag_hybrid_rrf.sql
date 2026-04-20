-- Hybrid chunk search via Reciprocal Rank Fusion.
--
-- Runs vector search and FTS in parallel, assigns each hit a score
-- `1 / (RRF_K + rank)` from each signal, and sums. RRF_K = 60 is the
-- standard Elastic default. Merging is stable and parameter-free so we
-- don't need query-specific tuning.
--
-- Returns one row per file_id + chunk_index, highest combined score first.
-- The caller can further filter by terminal_id (scoped search).
--
-- When embeddings are disabled (no OPENAI_API_KEY), _query_embedding will
-- arrive as NULL and the vector half drops out — this degrades cleanly to
-- FTS-only search.

CREATE OR REPLACE FUNCTION search_chunks_hybrid(
  _query TEXT,
  _query_embedding VECTOR(1536) DEFAULT NULL,
  _terminal UUID DEFAULT NULL,
  _limit INT DEFAULT 8,
  _rrf_k INT DEFAULT 60
)
RETURNS TABLE (
  file_id UUID,
  terminal_id UUID,
  chunk_index INT,
  content TEXT,
  page_number INT,
  vector_rank INT,
  fts_rank INT,
  score FLOAT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH vector_hits AS (
    SELECT
      fc.file_id,
      fc.terminal_id,
      fc.chunk_index,
      fc.content,
      fc.page_number,
      row_number() OVER (
        ORDER BY fc.embedding <=> _query_embedding
      )::INT AS rnk
    FROM file_chunks fc
    WHERE _query_embedding IS NOT NULL
      AND fc.embedding IS NOT NULL
      AND (_terminal IS NULL OR fc.terminal_id = _terminal)
    ORDER BY fc.embedding <=> _query_embedding
    LIMIT _limit * 4
  ),
  fts_hits AS (
    SELECT
      fc.file_id,
      fc.terminal_id,
      fc.chunk_index,
      fc.content,
      fc.page_number,
      row_number() OVER (
        ORDER BY ts_rank_cd(
          fc.content_tsv,
          websearch_to_tsquery('english', _query)
        ) DESC
      )::INT AS rnk
    FROM file_chunks fc
    WHERE (_terminal IS NULL OR fc.terminal_id = _terminal)
      AND fc.content_tsv @@ websearch_to_tsquery('english', _query)
    ORDER BY ts_rank_cd(
      fc.content_tsv,
      websearch_to_tsquery('english', _query)
    ) DESC
    LIMIT _limit * 4
  ),
  merged AS (
    SELECT
      COALESCE(v.file_id, f.file_id) AS file_id,
      COALESCE(v.terminal_id, f.terminal_id) AS terminal_id,
      COALESCE(v.chunk_index, f.chunk_index) AS chunk_index,
      COALESCE(v.content, f.content) AS content,
      COALESCE(v.page_number, f.page_number) AS page_number,
      v.rnk AS vector_rank,
      f.rnk AS fts_rank,
      COALESCE(1.0 / (_rrf_k + v.rnk), 0.0)
        + COALESCE(1.0 / (_rrf_k + f.rnk), 0.0) AS score
    FROM vector_hits v
    FULL OUTER JOIN fts_hits f
      ON v.file_id = f.file_id AND v.chunk_index = f.chunk_index
  )
  SELECT file_id, terminal_id, chunk_index, content, page_number,
         vector_rank, fts_rank, score
  FROM merged
  ORDER BY score DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION search_chunks_hybrid(TEXT, VECTOR(1536), UUID, INT, INT)
  TO authenticated, service_role;
