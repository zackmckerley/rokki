-- Saved custom views.
--
-- A "view" is a per-user named bundle of {filter, sort, columns} that the
-- TasksPane / FilesPane / ActivityLog / AuditLog can switch between.
--
-- Shape decisions:
--   * `scope` is a string (not enum) so adding a new scope later is a code
--     change only, not a migration. CHECK constraint enforces the allowed
--     set today; we'll widen as panes adopt views.
--   * `terminal_id` is nullable: a view can be terminal-specific ("my
--     blocked tasks in BISCAYNE") or scope-wide ("my high-priority tasks
--     across every terminal I'm in"). The UI filters accordingly.
--   * `filter`, `sort`, `columns` are jsonb so the view shape can evolve
--     per pane without a migration each time. Each consuming pane defines
--     its own schema and ignores keys it doesn't know about.
--   * `is_shared` makes the view visible to other terminal members. RLS
--     enforces "shared & I'm in the terminal" — never global.

BEGIN;

CREATE TABLE user_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('tasks', 'files', 'activity', 'audit')),
  -- Optional: when set, the view is terminal-specific. NULL means
  -- "applies wherever I have a pane open at this scope". Only meaningful
  -- for scopes that exist inside a terminal (tasks, files); admin-scoped
  -- views (activity, audit) usually leave it NULL.
  terminal_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  -- Filter predicate, sort order, and visible columns. Schemas defined
  -- per-pane in apps/web — see TasksPane for the tasks-scope shape.
  filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort JSONB NOT NULL DEFAULT '{}'::jsonb,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Owner lookup: most queries are "my views for scope X (in terminal Y)".
CREATE INDEX idx_user_views_owner_scope
  ON user_views(owner_id, scope, terminal_id);

-- Shared lookup: "what shared views can I see for terminal Y at scope X?"
CREATE INDEX idx_user_views_shared
  ON user_views(scope, terminal_id)
  WHERE is_shared = TRUE;

CREATE TRIGGER trg_user_views_updated
  BEFORE UPDATE ON user_views
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_views ENABLE ROW LEVEL SECURITY;

-- SELECT — own views OR shared views in a terminal I can see. Views with
-- a NULL terminal_id can only be shared with no audience right now (the
-- only readers are the owner), so we let the owner-only path catch them.
CREATE POLICY "user_views_select" ON user_views FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR (
    is_shared = TRUE
    AND terminal_id IS NOT NULL
    AND is_terminal_member(terminal_id)
  )
);

-- INSERT — owner is always the caller; if a terminal_id is set the user
-- must be a member of it.
CREATE POLICY "user_views_insert" ON user_views FOR INSERT TO authenticated
WITH CHECK (
  owner_id = auth.uid()
  AND (terminal_id IS NULL OR is_terminal_member(terminal_id))
);

-- UPDATE — owner only. Reaffirm membership when terminal_id changes.
CREATE POLICY "user_views_update" ON user_views FOR UPDATE TO authenticated
USING (owner_id = auth.uid())
WITH CHECK (
  owner_id = auth.uid()
  AND (terminal_id IS NULL OR is_terminal_member(terminal_id))
);

-- DELETE — owner only.
CREATE POLICY "user_views_delete" ON user_views FOR DELETE TO authenticated
USING (owner_id = auth.uid());

COMMIT;
