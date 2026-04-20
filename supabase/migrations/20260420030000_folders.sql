-- Folders — virtual organization of files within a project.
--
-- Design:
--   - Paths are stored canonically as absolute paths starting with "/"
--     and containing no trailing slash: "/drawings", "/permits/2026".
--   - The root is "/". It's implicit (no row) — every project has it.
--   - Empty folders ARE persisted (that's the whole point of this table —
--     without it you couldn't "create folder" before uploading a file).
--   - Files live in `files.folder` matching a folder's `path` (or "/").
--   - Rename cascades: updating folder.path triggers files under that path
--     and subfolders to update too (handled in the API, not by trigger, so
--     we can scope the cascade to a single SECURITY DEFINER routine).

CREATE TABLE folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path TEXT NOT NULL,              -- canonical: "/", "/drawings", "/a/b"
  name TEXT NOT NULL,              -- last segment of path, e.g. "drawings"
  parent_path TEXT NOT NULL,       -- "/" for root-children, else parent's path
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT folders_path_format CHECK (path ~ '^/([^/]+(/[^/]+)*)?$'),
  UNIQUE (project_id, path)
);

CREATE INDEX idx_folders_project ON folders(project_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_folders_project_parent ON folders(project_id, parent_path)
  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_folders_updated BEFORE UPDATE ON folders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS: same visibility rules as files — project members see all folders.
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "folders_select" ON folders FOR SELECT TO authenticated
USING (is_project_member(project_id) OR has_emergency_access());

CREATE POLICY "folders_insert" ON folders FOR INSERT TO authenticated
WITH CHECK (is_project_member(project_id) AND created_by = auth.uid());

CREATE POLICY "folders_update" ON folders FOR UPDATE TO authenticated
USING (is_project_member(project_id));

CREATE POLICY "folders_delete" ON folders FOR DELETE TO authenticated
USING (is_project_manager(project_id));

-- ROLLBACK:
-- DROP TABLE folders CASCADE;
