-- Phase-4 depth modules: budget line items, schedule phases, permits,
-- vendors. All scoped to a terminal; visibility mirrors terminal_members.
--
-- Design notes:
--   * Kept the schemas small — start narrow, add columns when actual
--     vertical users ask. The idea is that a legal terminal and a
--     construction terminal share these tables but use different metadata
--     keys in the jsonb.
--   * No domain-specific enums. Status fields are CHECK-constrained text
--     so they can be extended without migrations.

/* -------------------------------------------------------------------- */
/* Budget                                                                */
/* -------------------------------------------------------------------- */

CREATE TABLE budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id UUID NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (char_length(category) BETWEEN 1 AND 80),
  description TEXT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK (char_length(currency) = 3),
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'committed', 'paid', 'cancelled')),
  incurred_on DATE,
  vendor_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_budget_items_terminal ON budget_items(terminal_id);
CREATE INDEX idx_budget_items_status ON budget_items(terminal_id, status);

/* -------------------------------------------------------------------- */
/* Vendors                                                               */
/* -------------------------------------------------------------------- */

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_vendors_space ON vendors(space_id);

-- Backfill the FK added on budget_items.
ALTER TABLE budget_items
  ADD CONSTRAINT budget_items_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON DELETE SET NULL;

/* -------------------------------------------------------------------- */
/* Schedule (phases / Gantt rows)                                        */
/* -------------------------------------------------------------------- */

CREATE TABLE schedule_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id UUID NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  color TEXT,
  depends_on UUID REFERENCES schedule_phases(id) ON DELETE SET NULL,
  position INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_schedule_phases_terminal ON schedule_phases(terminal_id, start_date);

/* -------------------------------------------------------------------- */
/* Permits                                                               */
/* -------------------------------------------------------------------- */

CREATE TABLE permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id UUID NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
  number TEXT,
  kind TEXT NOT NULL CHECK (char_length(kind) BETWEEN 1 AND 80),
  authority TEXT,
  status TEXT NOT NULL DEFAULT 'applied'
    CHECK (status IN ('applied', 'in_review', 'approved', 'issued', 'expired', 'denied')),
  applied_on DATE,
  issued_on DATE,
  expires_on DATE,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_permits_terminal ON permits(terminal_id);
CREATE INDEX idx_permits_expiring ON permits(expires_on) WHERE status IN ('issued', 'approved');

/* -------------------------------------------------------------------- */
/* RLS                                                                   */
/* -------------------------------------------------------------------- */

ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE permits ENABLE ROW LEVEL SECURITY;

-- Budget: any terminal member can read; manager/owner can write.
CREATE POLICY "budget_items_select" ON budget_items
  FOR SELECT TO authenticated
  USING (is_terminal_member(terminal_id));
CREATE POLICY "budget_items_write" ON budget_items
  FOR ALL TO authenticated
  USING (is_terminal_manager(terminal_id))
  WITH CHECK (is_terminal_manager(terminal_id));

-- Vendors: any space member can read; space admin/owner can write.
CREATE POLICY "vendors_select" ON vendors
  FOR SELECT TO authenticated
  USING (is_space_member(space_id));
CREATE POLICY "vendors_write" ON vendors
  FOR ALL TO authenticated
  USING (is_space_admin(space_id))
  WITH CHECK (is_space_admin(space_id));

-- Schedule phases: terminal members read/write (everyone on a project
-- can push their phase dates; managers can lock/unlock separately later).
CREATE POLICY "schedule_phases_select" ON schedule_phases
  FOR SELECT TO authenticated
  USING (is_terminal_member(terminal_id));
CREATE POLICY "schedule_phases_write" ON schedule_phases
  FOR ALL TO authenticated
  USING (is_terminal_member(terminal_id))
  WITH CHECK (is_terminal_member(terminal_id));

-- Permits: read by any member, write by manager/owner (permits are
-- consequential — you don't want a guest renaming them).
CREATE POLICY "permits_select" ON permits
  FOR SELECT TO authenticated
  USING (is_terminal_member(terminal_id));
CREATE POLICY "permits_write" ON permits
  FOR ALL TO authenticated
  USING (is_terminal_manager(terminal_id))
  WITH CHECK (is_terminal_manager(terminal_id));

/* -------------------------------------------------------------------- */
/* Realtime — emit inserts/updates so the terminal panes can react       */
/* -------------------------------------------------------------------- */

ALTER PUBLICATION supabase_realtime ADD TABLE budget_items;
ALTER PUBLICATION supabase_realtime ADD TABLE vendors;
ALTER PUBLICATION supabase_realtime ADD TABLE schedule_phases;
ALTER PUBLICATION supabase_realtime ADD TABLE permits;
