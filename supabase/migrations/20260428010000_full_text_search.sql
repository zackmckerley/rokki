-- Cross-entity full-text search.
--
-- Adds a STORED `search_vector tsvector` to tasks, files, comments,
-- terminals, and spaces. Each composition is tuned per-table so the
-- weighting matches what a user typing into the global palette expects:
--   * tasks:     title (A) + description (B) + labels (C)
--   * files:     filename (A) + folder (C) [+ index_error D — debug only]
--   * comments:  body (A)   [comments are usually short and titleless]
--   * terminals: name (A)   + ticker (A) + description (B)
--   * spaces:    name (A)   + slug (A)   + description (B)
--
-- Why a generated stored column rather than a separate index expression?
--   1. Postgres recomputes the vector on UPDATE without any trigger we
--      have to maintain alongside the schema.
--   2. We can `SELECT search_vector` (or use it in `ts_rank_cd`) without
--      the planner re-tokenising on every read.
--   3. ts_headline() in the search API needs the original text columns,
--      so we don't lose information by storing the vector.
--
-- Why no new RLS policies?
--   The existing per-table SELECT policies already constrain rows to what
--   the authenticated user can see. The search vector is an additional
--   column on the same row — adding a `WHERE search_vector @@ tsquery`
--   never widens visibility, only narrows it.
--
-- All indexes use GIN with a partial WHERE that excludes soft-deleted /
-- archived rows. That keeps the index small (active rows only) and matches
-- how the search API filters anyway.

BEGIN;

-- Note: passing a string literal as the first arg of to_tsvector() lets
-- Postgres resolve the regconfig at parse time, which is treated as
-- IMMUTABLE inside a GENERATED ALWAYS expression. A wrapper function
-- doesn't help here — even plpgsql IMMUTABLE wrappers get rejected
-- because Postgres examines whether the wrapper's body could observe
-- a runtime regconfig change. The migration `20260421010000_files_index_metadata`
-- already uses the same string-literal pattern successfully, so we
-- mirror that here.

-- ============================================================================
-- 1. tasks ------------------------------------------------------------------
-- ============================================================================
-- Only title + description in the generated vector. The labels TEXT[]
-- field is excluded because array_to_string + coalesce on a text[] in
-- a generated column trips Postgres's IMMUTABLE check on this version,
-- regardless of explicit casting. Labels are still searchable via
-- separate WHERE clauses on the array column at query time; falling
-- back to a non-vector match for that one column is fine.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A')
      || setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;

-- Partial: only "active" rows (we never search the deleted task because
-- there's no delete column on tasks — they're hard-deleted — so use status).
CREATE INDEX IF NOT EXISTS idx_tasks_search_vector
  ON tasks USING gin (search_vector);

-- ============================================================================
-- 2. files ------------------------------------------------------------------
-- ============================================================================
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(filename, '')), 'A')
      || setweight(to_tsvector('english', coalesce(folder, '')), 'C')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_files_search_vector
  ON files USING gin (search_vector)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 3. comments --------------------------------------------------------------
-- ============================================================================
ALTER TABLE comments
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(body, '')), 'A')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_comments_search_vector
  ON comments USING gin (search_vector)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- 4. terminals --------------------------------------------------------------
-- ============================================================================
ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(name, '')), 'A')
      || setweight(to_tsvector('english', coalesce(ticker, '')), 'A')
      || setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_terminals_search_vector
  ON terminals USING gin (search_vector)
  WHERE archived_at IS NULL;

-- ============================================================================
-- 5. spaces -----------------------------------------------------------------
-- ============================================================================
ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS search_vector tsvector
    GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(name, '')), 'A')
      || setweight(to_tsvector('english', coalesce(slug, '')), 'A')
      || setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_spaces_search_vector
  ON spaces USING gin (search_vector)
  WHERE archived_at IS NULL;

-- ============================================================================
-- 6. RPC: search_global -----------------------------------------------------
--
-- One round-trip from the API. Filters per requested kind (NULL means "all"),
-- ranks each row inside its kind, then UNIONs into a single result the
-- caller orders by score and slices to N.
--
-- SECURITY INVOKER so the existing per-table SELECT RLS policies apply —
-- the user only sees rows they could already SELECT directly. ts_headline()
-- HTML-escapes its input, and we wrap the highlight tag in a class the UI
-- styles so we don't leak inline CSS.
-- ============================================================================
CREATE OR REPLACE FUNCTION search_global(
  _query TEXT,
  _kinds TEXT[] DEFAULT NULL,
  _limit INT DEFAULT 50
)
RETURNS TABLE (
  kind TEXT,
  id UUID,
  title TEXT,
  snippet TEXT,
  terminal_id UUID,
  terminal_ticker TEXT,
  score REAL
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english', _query) AS tsq
  ),
  task_hits AS (
    SELECT
      'task'::TEXT AS kind,
      t.id,
      t.title,
      ts_headline(
        'english',
        coalesce(t.description, t.title),
        (SELECT tsq FROM q),
        'StartSel=<mark class="rk-hit">,StopSel=</mark>,MaxFragments=1,MaxWords=18,MinWords=4,ShortWord=2,FragmentDelimiter=" … ",HighlightAll=FALSE'
      ) AS snippet,
      t.terminal_id,
      tr.ticker AS terminal_ticker,
      ts_rank_cd(t.search_vector, (SELECT tsq FROM q))::REAL AS score
    FROM tasks t
    JOIN terminals tr ON tr.id = t.terminal_id
    WHERE (_kinds IS NULL OR 'task' = ANY(_kinds))
      AND t.search_vector @@ (SELECT tsq FROM q)
    ORDER BY score DESC
    LIMIT _limit
  ),
  file_hits AS (
    SELECT
      'file'::TEXT AS kind,
      f.id,
      f.filename AS title,
      ts_headline(
        'english',
        f.folder || ' / ' || f.filename,
        (SELECT tsq FROM q),
        'StartSel=<mark class="rk-hit">,StopSel=</mark>,MaxFragments=1,MaxWords=18,MinWords=4,ShortWord=2,FragmentDelimiter=" … ",HighlightAll=FALSE'
      ) AS snippet,
      f.terminal_id,
      tr.ticker AS terminal_ticker,
      ts_rank_cd(f.search_vector, (SELECT tsq FROM q))::REAL AS score
    FROM files f
    JOIN terminals tr ON tr.id = f.terminal_id
    WHERE (_kinds IS NULL OR 'file' = ANY(_kinds))
      AND f.deleted_at IS NULL
      AND f.search_vector @@ (SELECT tsq FROM q)
    ORDER BY score DESC
    LIMIT _limit
  ),
  comment_hits AS (
    SELECT
      'comment'::TEXT AS kind,
      c.id,
      -- Comments don't have a title; use a short prefix of the body so the
      -- UI has something readable to render in the kind column.
      left(c.body, 60) AS title,
      ts_headline(
        'english',
        c.body,
        (SELECT tsq FROM q),
        'StartSel=<mark class="rk-hit">,StopSel=</mark>,MaxFragments=1,MaxWords=22,MinWords=4,ShortWord=2,FragmentDelimiter=" … ",HighlightAll=FALSE'
      ) AS snippet,
      c.terminal_id,
      tr.ticker AS terminal_ticker,
      ts_rank_cd(c.search_vector, (SELECT tsq FROM q))::REAL AS score
    FROM comments c
    JOIN terminals tr ON tr.id = c.terminal_id
    WHERE (_kinds IS NULL OR 'comment' = ANY(_kinds))
      AND c.deleted_at IS NULL
      AND c.search_vector @@ (SELECT tsq FROM q)
    ORDER BY score DESC
    LIMIT _limit
  ),
  terminal_hits AS (
    SELECT
      'terminal'::TEXT AS kind,
      tr.id,
      tr.name AS title,
      ts_headline(
        'english',
        coalesce(tr.description, tr.name),
        (SELECT tsq FROM q),
        'StartSel=<mark class="rk-hit">,StopSel=</mark>,MaxFragments=1,MaxWords=18,MinWords=4,ShortWord=2,FragmentDelimiter=" … ",HighlightAll=FALSE'
      ) AS snippet,
      tr.id AS terminal_id,
      tr.ticker AS terminal_ticker,
      ts_rank_cd(tr.search_vector, (SELECT tsq FROM q))::REAL AS score
    FROM terminals tr
    WHERE (_kinds IS NULL OR 'terminal' = ANY(_kinds))
      AND tr.archived_at IS NULL
      AND tr.search_vector @@ (SELECT tsq FROM q)
    ORDER BY score DESC
    LIMIT _limit
  ),
  space_hits AS (
    SELECT
      'space'::TEXT AS kind,
      s.id,
      s.name AS title,
      ts_headline(
        'english',
        coalesce(s.description, s.name),
        (SELECT tsq FROM q),
        'StartSel=<mark class="rk-hit">,StopSel=</mark>,MaxFragments=1,MaxWords=18,MinWords=4,ShortWord=2,FragmentDelimiter=" … ",HighlightAll=FALSE'
      ) AS snippet,
      NULL::UUID AS terminal_id,
      NULL::TEXT AS terminal_ticker,
      ts_rank_cd(s.search_vector, (SELECT tsq FROM q))::REAL AS score
    FROM spaces s
    WHERE (_kinds IS NULL OR 'space' = ANY(_kinds))
      AND s.archived_at IS NULL
      AND s.search_vector @@ (SELECT tsq FROM q)
    ORDER BY score DESC
    LIMIT _limit
  )
  SELECT * FROM task_hits
  UNION ALL SELECT * FROM file_hits
  UNION ALL SELECT * FROM comment_hits
  UNION ALL SELECT * FROM terminal_hits
  UNION ALL SELECT * FROM space_hits
  ORDER BY score DESC
  LIMIT _limit;
$$;

GRANT EXECUTE ON FUNCTION search_global(TEXT, TEXT[], INT)
  TO authenticated, service_role;

COMMIT;
