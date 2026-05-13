-- Module system foundation.
--
-- Four new tables, fully additive — nothing existing changes:
--   - modules_catalog      — global registry of installable slugs
--   - space_modules        — which modules a space has installed
--   - terminal_modules     — which modules a terminal has installed
--   - user_module_pins     — per-user tab ordering + F-key bindings
--
-- Plus one row in `feature_flags` to gate the new UI:
--   - pane_shell_enabled = false, rollout_percentage = 0
--
-- See `docs/01_DATA_MODEL.md §1.13` for the full spec and
-- `MODULE_PLAN.md` for context. Rollback at the bottom (and a paired
-- copy at `supabase/migrations/rollbacks/20260513010000_modules_init.down.sql`).

BEGIN;

-- ───────────────────────────────────────────────────────────────────
-- modules_catalog
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE modules_catalog (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 64),
  description TEXT NOT NULL CHECK (char_length(description) BETWEEN 1 AND 280),
  icon TEXT,
  scopes TEXT[] NOT NULL CHECK (
    array_length(scopes, 1) >= 1
    AND scopes <@ ARRAY['user','space','terminal']
  ),
  vertical TEXT NULL CHECK (vertical IS NULL OR vertical IN ('realestate','construction','legal')),
  enabled_by_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE modules_catalog ENABLE ROW LEVEL SECURITY;

-- Catalog is read-only for everyone authenticated. Writes happen via
-- migrations (this file) or service-role tooling.
CREATE POLICY "modules_catalog_read" ON modules_catalog
  FOR SELECT TO authenticated USING (TRUE);

-- ───────────────────────────────────────────────────────────────────
-- space_modules
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE space_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  slug TEXT NOT NULL REFERENCES modules_catalog(slug),
  display_order INT NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  installed_by UUID NOT NULL REFERENCES auth.users(id),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  UNIQUE (space_id, slug)
);

CREATE INDEX idx_space_modules_active
  ON space_modules(space_id)
  WHERE archived_at IS NULL;

ALTER TABLE space_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "space_modules_read" ON space_modules
  FOR SELECT TO authenticated USING (
    space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid())
  );

-- Install / archive / reorder gated to space owners and admins.
-- Members without admin role can't change the installed-module set.
CREATE POLICY "space_modules_write" ON space_modules
  FOR ALL TO authenticated
  USING (
    space_id IN (
      SELECT space_id FROM space_members
      WHERE user_id = auth.uid() AND role IN ('owner','admin')
    )
  )
  WITH CHECK (
    space_id IN (
      SELECT space_id FROM space_members
      WHERE user_id = auth.uid() AND role IN ('owner','admin')
    )
  );

-- ───────────────────────────────────────────────────────────────────
-- terminal_modules
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE terminal_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id UUID NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
  slug TEXT NOT NULL REFERENCES modules_catalog(slug),
  display_order INT NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  installed_by UUID NOT NULL REFERENCES auth.users(id),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  UNIQUE (terminal_id, slug)
);

CREATE INDEX idx_terminal_modules_active
  ON terminal_modules(terminal_id)
  WHERE archived_at IS NULL;

ALTER TABLE terminal_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "terminal_modules_read" ON terminal_modules
  FOR SELECT TO authenticated USING (
    terminal_id IN (SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid())
  );

-- Install / archive / reorder gated to terminal owners and managers.
CREATE POLICY "terminal_modules_write" ON terminal_modules
  FOR ALL TO authenticated
  USING (
    terminal_id IN (
      SELECT terminal_id FROM terminal_members
      WHERE user_id = auth.uid() AND role IN ('owner','manager')
    )
  )
  WITH CHECK (
    terminal_id IN (
      SELECT terminal_id FROM terminal_members
      WHERE user_id = auth.uid() AND role IN ('owner','manager')
    )
  );

-- ───────────────────────────────────────────────────────────────────
-- user_module_pins
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE user_module_pins (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope_kind TEXT NOT NULL CHECK (scope_kind IN ('user','space','terminal')),
  scope_id UUID NULL,
  slug TEXT NOT NULL REFERENCES modules_catalog(slug),
  display_order INT NOT NULL,
  fn_key INT NULL CHECK (fn_key IS NULL OR fn_key BETWEEN 5 AND 10),
  PRIMARY KEY (user_id, scope_kind, scope_id, slug),
  -- scope_id NULL only for scope_kind='user'; non-null otherwise.
  CONSTRAINT user_module_pins_scope_shape CHECK (
    (scope_kind = 'user' AND scope_id IS NULL)
    OR (scope_kind IN ('space','terminal') AND scope_id IS NOT NULL)
  )
);

ALTER TABLE user_module_pins ENABLE ROW LEVEL SECURITY;

-- Pins are private to their owner. No cross-user reads, no cross-user
-- writes. The pane shell merges pins with installed-module rows for
-- the current scope at read time.
CREATE POLICY "user_module_pins_own" ON user_module_pins
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────
-- Seed catalog
-- ───────────────────────────────────────────────────────────────────

-- Five v1 module slugs. "tasks", "messenger", and "schedule" already
-- have working implementations under apps/web/src/app/ — Phase 1
-- wraps them in manifests. "files" is built from scratch in Phase 1.
-- "goals" is ported from Claude/rokki-goals/ in Phase 2.
INSERT INTO modules_catalog (slug, name, description, icon, scopes, enabled_by_default) VALUES
  ('tasks',     'Tasks',     'Track to-dos with priorities, assignees, and due dates.',  'check-square',   ARRAY['user','space','terminal'], TRUE),
  ('files',     'Files',     'Upload, organize, and find documents and assets.',         'folder',         ARRAY['space','terminal'],        TRUE),
  ('messenger', 'Messenger', 'Real-time chat with threads, mentions, and reactions.',    'message-square', ARRAY['user','space','terminal'], TRUE),
  ('schedule',  'Schedule',  'Calendar of events, deadlines, milestones, dependencies.', 'calendar',       ARRAY['user','space','terminal'], TRUE),
  ('goals',     'Goals',     'Weekly numeric targets with daily entries.',               'target',         ARRAY['space','terminal'],        FALSE);

-- ───────────────────────────────────────────────────────────────────
-- Feature flag (off by default)
-- ───────────────────────────────────────────────────────────────────

-- Gates the new sidebar + pane-shell UI. Until this flips on per-user,
-- the old layout renders.
INSERT INTO feature_flags (key, scope, value, rollout_percentage, description)
VALUES (
  'pane_shell_enabled',
  'global',
  'false'::jsonb,
  0,
  'Module system: gates the new scope-only sidebar + module tab strip + pane shell UI. Set value=true for a specific user (scope=user, scope_id=<uid>) to dogfood.'
);

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DELETE FROM feature_flags WHERE key = 'pane_shell_enabled';
-- DROP TABLE IF EXISTS user_module_pins CASCADE;
-- DROP TABLE IF EXISTS terminal_modules CASCADE;
-- DROP TABLE IF EXISTS space_modules CASCADE;
-- DROP TABLE IF EXISTS modules_catalog CASCADE;
-- COMMIT;
