-- Terminology alignment:
--   orgs      → spaces      (the top-level tenant where people live)
--   projects  → terminals   (a single working context: project / matter / household)
--
-- Mechanical:
--   - tables + columns renamed via ALTER … RENAME (preserves OIDs, so RLS
--     policies continue to bind correctly)
--   - helper functions renamed via ALTER FUNCTION RENAME, then bodies
--     updated via CREATE OR REPLACE so the stored text reads with the new
--     names (SQL functions work immediately after RENAME COLUMN because
--     column references are already OID-bound, but we want the text clean)
--   - triggers renamed via ALTER TRIGGER RENAME
--   - enum values project.* renamed to terminal.*
--   - type `project_role` renamed to `terminal_role`
--
-- Safe in one migration because every step is DDL in the same transaction
-- and we don't lose data. Realtime publication membership is preserved
-- through RENAME (the publication binds by OID).

BEGIN;

-- 1. Rename tables ----------------------------------------------------------

ALTER TABLE orgs RENAME TO spaces;
ALTER TABLE org_members RENAME TO space_members;
ALTER TABLE projects RENAME TO terminals;
ALTER TABLE project_members RENAME TO terminal_members;

-- 2. Rename columns ---------------------------------------------------------

ALTER TABLE space_members RENAME COLUMN org_id TO space_id;
ALTER TABLE terminals RENAME COLUMN org_id TO space_id;
ALTER TABLE activity RENAME COLUMN org_id TO space_id;
ALTER TABLE activity RENAME COLUMN project_id TO terminal_id;
ALTER TABLE invites RENAME COLUMN org_id TO space_id;
ALTER TABLE invites RENAME COLUMN project_id TO terminal_id;
ALTER TABLE terminal_members RENAME COLUMN project_id TO terminal_id;
ALTER TABLE tasks RENAME COLUMN project_id TO terminal_id;
ALTER TABLE files RENAME COLUMN project_id TO terminal_id;
ALTER TABLE folders RENAME COLUMN project_id TO terminal_id;
ALTER TABLE file_chunks RENAME COLUMN project_id TO terminal_id;
ALTER TABLE comments RENAME COLUMN project_id TO terminal_id;
ALTER TABLE tool_invocations RENAME COLUMN project_id TO terminal_id;
ALTER TABLE notifications RENAME COLUMN project_id TO terminal_id;
ALTER TABLE approvals RENAME COLUMN approver_org_id TO approver_space_id;
ALTER TABLE approvals RENAME COLUMN approver_project_id TO approver_terminal_id;
ALTER TABLE tools RENAME COLUMN owner_org_id TO owner_space_id;

-- 3. Rename activity enum values -------------------------------------------

ALTER TYPE activity_action RENAME VALUE 'project.create' TO 'terminal.create';
ALTER TYPE activity_action RENAME VALUE 'project.update' TO 'terminal.update';
ALTER TYPE activity_action RENAME VALUE 'project.archive' TO 'terminal.archive';

-- 4. Rename `project_role` enum → `terminal_role` --------------------------

ALTER TYPE project_role RENAME TO terminal_role;

-- 5. Rename RLS helpers -----------------------------------------------------

ALTER FUNCTION is_org_member(UUID) RENAME TO is_space_member;
ALTER FUNCTION is_org_admin(UUID) RENAME TO is_space_admin;
ALTER FUNCTION is_project_member(UUID) RENAME TO is_terminal_member;
ALTER FUNCTION is_project_manager(UUID) RENAME TO is_terminal_manager;
ALTER FUNCTION project_role(UUID) RENAME TO terminal_role;

-- 6. Rename trigger functions + triggers ------------------------------------

ALTER FUNCTION add_project_creator_as_owner() RENAME TO add_terminal_creator_as_owner;
ALTER FUNCTION add_org_creator_as_owner() RENAME TO add_space_creator_as_owner;
ALTER TRIGGER trg_project_creator ON terminals RENAME TO trg_terminal_creator;
ALTER TRIGGER trg_org_creator ON spaces RENAME TO trg_space_creator;

-- 7. Refresh function bodies so the stored text uses new names. Keep the
--    original parameter names (_org, _project) because CREATE OR REPLACE
--    can't change them — the function names themselves got renamed above.

CREATE OR REPLACE FUNCTION is_space_member(_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM space_members
    WHERE space_id = _org AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_space_admin(_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM space_members
    WHERE space_id = _org AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION is_terminal_member(_project UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM terminal_members
    WHERE terminal_id = _project AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM terminals t
    JOIN space_members sm ON sm.space_id = t.space_id
    WHERE t.id = _project
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION terminal_role(_project UUID)
RETURNS terminal_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM terminal_members
  WHERE terminal_id = _project AND user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_terminal_manager(_project UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT terminal_role(_project) IN ('owner', 'manager')
  OR EXISTS (
    SELECT 1 FROM terminals t
    JOIN space_members sm ON sm.space_id = t.space_id
    WHERE t.id = _project
      AND sm.user_id = auth.uid()
      AND sm.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION can_see_file(_file files)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT is_terminal_member(_file.terminal_id) THEN false
    WHEN _file.visibility = 'project' THEN true
    WHEN _file.visibility = 'owners' THEN is_terminal_manager(_file.terminal_id)
    WHEN _file.visibility = 'custom' THEN
      auth.uid() = ANY(_file.visibility_users)
      OR terminal_role(_file.terminal_id) = ANY(_file.visibility_roles)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION add_terminal_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO terminal_members (terminal_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION add_space_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO space_members (space_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RAG retrieval RPCs — drop + recreate because the TABLE return columns
--    were renamed (CREATE OR REPLACE can't change output column names).

DROP FUNCTION IF EXISTS search_chunks_vector(VECTOR(1536), UUID, INT);
DROP FUNCTION IF EXISTS search_chunks_fts(TEXT, UUID, INT);

CREATE FUNCTION search_chunks_vector(
  _query_embedding VECTOR(1536),
  _project UUID DEFAULT NULL,
  _limit INT DEFAULT 8
)
RETURNS TABLE (
  file_id UUID,
  terminal_id UUID,
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
    fc.terminal_id,
    fc.chunk_index,
    fc.content,
    fc.page_number,
    (fc.embedding <=> _query_embedding) AS distance
  FROM file_chunks fc
  WHERE fc.embedding IS NOT NULL
    AND (_project IS NULL OR fc.terminal_id = _project)
  ORDER BY fc.embedding <=> _query_embedding
  LIMIT _limit;
$$;

CREATE FUNCTION search_chunks_fts(
  _query TEXT,
  _project UUID DEFAULT NULL,
  _limit INT DEFAULT 8
)
RETURNS TABLE (
  file_id UUID,
  terminal_id UUID,
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
    fc.terminal_id,
    fc.chunk_index,
    fc.content,
    fc.page_number,
    ts_rank_cd(fc.content_tsv, websearch_to_tsquery('english', _query)) AS rank
  FROM file_chunks fc
  WHERE (_project IS NULL OR fc.terminal_id = _project)
    AND fc.content_tsv @@ websearch_to_tsquery('english', _query)
  ORDER BY rank DESC
  LIMIT _limit;
$$;

-- Grants on renamed helpers (DDL ALTER doesn't revoke them, but re-grant
-- defensively in case earlier migrations relied on specific names).

GRANT EXECUTE ON FUNCTION is_space_member(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_space_admin(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_terminal_member(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_terminal_manager(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION terminal_role(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION can_see_file(files) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION search_chunks_vector(VECTOR(1536), UUID, INT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION search_chunks_fts(TEXT, UUID, INT)
  TO authenticated, service_role;

COMMIT;
