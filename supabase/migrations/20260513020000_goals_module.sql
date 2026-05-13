-- Goals module — port of the standalone `Claude/rokki-goals/` JSON
-- store into Postgres so Goals becomes a first-class Rokki module.
--
-- Schema mirrors `Claude/rokki-goals/lib/types.ts` with two changes:
--   1. Add `space_id` (nullable) and `terminal_id` (nullable) to the
--      top-level `goals_categories` table. Exactly one is set per row
--      (CHECK constraint). Goals, targets, and entries inherit their
--      scope from their parent category via the FK chain.
--   2. RLS gates visibility through `space_members` /
--      `terminal_members` membership, matching the rest of Rokki.
--
-- Tables are namespaced with `goals_` so we don't collide with any
-- top-level table named `categories` / `goals` / etc. later.
--
-- See `MODULE_PLAN.md §4 Phase 2` and `docs/01_DATA_MODEL.md §1.13`
-- for the broader module system context. Rollback at the bottom.

BEGIN;

-- ───────────────────────────────────────────────────────────────────
-- goals_categories
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE goals_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  terminal_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  color TEXT NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  icon TEXT,
  display_order INT NOT NULL DEFAULT 0,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly one of space_id / terminal_id must be set.
  CONSTRAINT goals_categories_scope_shape CHECK (
    (space_id IS NOT NULL AND terminal_id IS NULL) OR
    (space_id IS NULL AND terminal_id IS NOT NULL)
  )
);

CREATE INDEX idx_goals_categories_space
  ON goals_categories(space_id) WHERE space_id IS NOT NULL;
CREATE INDEX idx_goals_categories_terminal
  ON goals_categories(terminal_id) WHERE terminal_id IS NOT NULL;

ALTER TABLE goals_categories ENABLE ROW LEVEL SECURITY;

-- Members of the parent scope can read.
CREATE POLICY "goals_categories_read" ON goals_categories
  FOR SELECT TO authenticated USING (
    (space_id IS NOT NULL AND space_id IN (
      SELECT space_id FROM space_members WHERE user_id = auth.uid()
    ))
    OR
    (terminal_id IS NOT NULL AND terminal_id IN (
      SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid()
    ))
  );

-- Any member of the scope can create / edit categories.
CREATE POLICY "goals_categories_write" ON goals_categories
  FOR ALL TO authenticated
  USING (
    (space_id IS NOT NULL AND space_id IN (
      SELECT space_id FROM space_members WHERE user_id = auth.uid()
    ))
    OR
    (terminal_id IS NOT NULL AND terminal_id IN (
      SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (space_id IS NOT NULL AND space_id IN (
      SELECT space_id FROM space_members WHERE user_id = auth.uid()
    ))
    OR
    (terminal_id IS NOT NULL AND terminal_id IN (
      SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid()
    ))
  );

-- ───────────────────────────────────────────────────────────────────
-- goals_goals — the individual numeric goal lines
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE goals_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES goals_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  unit TEXT NOT NULL CHECK (char_length(unit) BETWEEN 1 AND 24),
  display_order INT NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual','auto')),
  source_config JSONB,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_goals_goals_category ON goals_goals(category_id);

ALTER TABLE goals_goals ENABLE ROW LEVEL SECURITY;

-- Inherit visibility through the parent category — if you can see the
-- category, you can see/edit its goals.
CREATE POLICY "goals_goals_read" ON goals_goals
  FOR SELECT TO authenticated USING (
    category_id IN (SELECT id FROM goals_categories)
  );
CREATE POLICY "goals_goals_write" ON goals_goals
  FOR ALL TO authenticated
  USING (category_id IN (SELECT id FROM goals_categories))
  WITH CHECK (category_id IN (SELECT id FROM goals_categories));

-- ───────────────────────────────────────────────────────────────────
-- goals_targets — weekly target for a goal, valid from a given date
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE goals_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals_goals(id) ON DELETE CASCADE,
  weekly_target NUMERIC(12,2) NOT NULL CHECK (weekly_target >= 0),
  valid_from DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One target per goal per valid_from — re-targeting same week is an
  -- update, not a stack.
  UNIQUE (goal_id, valid_from)
);

CREATE INDEX idx_goals_targets_goal_valid
  ON goals_targets(goal_id, valid_from DESC);

ALTER TABLE goals_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals_targets_read" ON goals_targets
  FOR SELECT TO authenticated USING (
    goal_id IN (SELECT id FROM goals_goals)
  );
CREATE POLICY "goals_targets_write" ON goals_targets
  FOR ALL TO authenticated
  USING (goal_id IN (SELECT id FROM goals_goals))
  WITH CHECK (goal_id IN (SELECT id FROM goals_goals));

-- ───────────────────────────────────────────────────────────────────
-- goals_entries — daily values
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE goals_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES goals_goals(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  value NUMERIC(12,2) NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One entry per goal per date — adjusting the same day's number is
  -- an UPDATE on the existing row.
  UNIQUE (goal_id, entry_date)
);

CREATE INDEX idx_goals_entries_goal_date
  ON goals_entries(goal_id, entry_date DESC);

ALTER TABLE goals_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals_entries_read" ON goals_entries
  FOR SELECT TO authenticated USING (
    goal_id IN (SELECT id FROM goals_goals)
  );
CREATE POLICY "goals_entries_write" ON goals_entries
  FOR ALL TO authenticated
  USING (goal_id IN (SELECT id FROM goals_goals))
  WITH CHECK (goal_id IN (SELECT id FROM goals_goals));

-- ───────────────────────────────────────────────────────────────────
-- goals_settings — per-scope module-level config (week-start day, etc.)
-- ───────────────────────────────────────────────────────────────────

CREATE TABLE goals_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  terminal_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
  week_start_dow INT NOT NULL DEFAULT 1 CHECK (week_start_dow BETWEEN 0 AND 6),
  default_category_id UUID REFERENCES goals_categories(id) ON DELETE SET NULL,
  setup_complete BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT goals_settings_scope_shape CHECK (
    (space_id IS NOT NULL AND terminal_id IS NULL) OR
    (space_id IS NULL AND terminal_id IS NOT NULL)
  ),
  CONSTRAINT goals_settings_one_per_scope CHECK (
    (space_id IS NOT NULL) OR (terminal_id IS NOT NULL)
  )
);

-- One settings row per scope.
CREATE UNIQUE INDEX uq_goals_settings_space
  ON goals_settings(space_id) WHERE space_id IS NOT NULL;
CREATE UNIQUE INDEX uq_goals_settings_terminal
  ON goals_settings(terminal_id) WHERE terminal_id IS NOT NULL;

ALTER TABLE goals_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals_settings_read" ON goals_settings
  FOR SELECT TO authenticated USING (
    (space_id IS NOT NULL AND space_id IN (
      SELECT space_id FROM space_members WHERE user_id = auth.uid()
    ))
    OR
    (terminal_id IS NOT NULL AND terminal_id IN (
      SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid()
    ))
  );
CREATE POLICY "goals_settings_write" ON goals_settings
  FOR ALL TO authenticated
  USING (
    (space_id IS NOT NULL AND space_id IN (
      SELECT space_id FROM space_members WHERE user_id = auth.uid()
    ))
    OR
    (terminal_id IS NOT NULL AND terminal_id IN (
      SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid()
    ))
  )
  WITH CHECK (
    (space_id IS NOT NULL AND space_id IN (
      SELECT space_id FROM space_members WHERE user_id = auth.uid()
    ))
    OR
    (terminal_id IS NOT NULL AND terminal_id IN (
      SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid()
    ))
  );

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP TABLE IF EXISTS goals_settings CASCADE;
-- DROP TABLE IF EXISTS goals_entries CASCADE;
-- DROP TABLE IF EXISTS goals_targets CASCADE;
-- DROP TABLE IF EXISTS goals_goals CASCADE;
-- DROP TABLE IF EXISTS goals_categories CASCADE;
-- COMMIT;
