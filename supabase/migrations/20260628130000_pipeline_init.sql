-- Pipeline module — lightweight lead/deal flow that links into Contacts and
-- promotes the winners into Terminals.
--
-- Tiers: a high-volume **lead** (pl_leads, the ~200 you track lightly) lives on
-- a space's pipeline at a stage; when it "goes hard" it's promoted to a
-- Terminal (the heavy project) and marked converted. Leads + the terminals they
-- become share a space. Contacts are LINKED (pl_lead_contacts / terminal_contacts),
-- never copied.
--
-- See Claude/CONTACTS_PIPELINE_BUILD_PLAN.md.

BEGIN;

-- ───────────────────────────────────────────────────────────────────
-- pl_pipelines — a space's pipeline definition (creator picks stages + fields).
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE pl_pipelines (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id   UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  kind       TEXT NOT NULL DEFAULT 'generic',
  -- ordered [{key,label,color,type:open|won|lost,rotting_days?,is_terminal_gate?}]
  stages     JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- custom field schema [{key,label,type,options?}]
  fields     JSONB NOT NULL DEFAULT '[]'::jsonb,
  position   INT  NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pl_pipelines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pl_pipelines_read" ON pl_pipelines
  FOR SELECT TO authenticated
  USING (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()));
CREATE POLICY "pl_pipelines_write" ON pl_pipelines
  FOR ALL TO authenticated
  USING (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()))
  WITH CHECK (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()));

CREATE INDEX pl_pipelines_space_idx ON pl_pipelines(space_id, position);

-- ───────────────────────────────────────────────────────────────────
-- pl_leads — the lightweight top-of-funnel record.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE pl_leads (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id          UUID NOT NULL REFERENCES pl_pipelines(id) ON DELETE CASCADE,
  space_id             UUID NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  subtitle             TEXT,
  stage                TEXT NOT NULL DEFAULT '',
  status               TEXT NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','won','lost','dead','converted')),
  priority             INT  NOT NULL DEFAULT 0 CHECK (priority BETWEEN 0 AND 3),
  source               TEXT,
  owner_id             UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  next_follow_up_at    TIMESTAMPTZ,
  last_activity_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  promoted_terminal_id UUID REFERENCES terminals(id) ON DELETE SET NULL,
  dead_reason          TEXT,
  lat                  DOUBLE PRECISION,
  lng                  DOUBLE PRECISION,
  attributes           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- custom field values
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE pl_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pl_leads_read" ON pl_leads
  FOR SELECT TO authenticated
  USING (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()));
CREATE POLICY "pl_leads_write" ON pl_leads
  FOR ALL TO authenticated
  USING (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()))
  WITH CHECK (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()));

CREATE INDEX pl_leads_pipeline_idx ON pl_leads(pipeline_id, stage);
CREATE INDEX pl_leads_space_idx ON pl_leads(space_id);
CREATE INDEX pl_leads_followup_idx ON pl_leads(space_id, next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL AND status = 'open';
CREATE INDEX pl_leads_terminal_idx ON pl_leads(promoted_terminal_id)
  WHERE promoted_terminal_id IS NOT NULL;

CREATE TRIGGER pl_leads_set_updated_at
  BEFORE UPDATE ON pl_leads
  FOR EACH ROW EXECUTE FUNCTION contacts_touch_updated_at();

-- ───────────────────────────────────────────────────────────────────
-- pl_lead_contacts — link a lead to shared Contacts (with a per-deal role).
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE pl_lead_contacts (
  lead_id    UUID NOT NULL REFERENCES pl_leads(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role       TEXT,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, contact_id)
);
ALTER TABLE pl_lead_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pl_lead_contacts_rw" ON pl_lead_contacts
  FOR ALL TO authenticated
  USING (
    lead_id IN (SELECT id FROM pl_leads) AND contact_id IN (SELECT id FROM contacts)
  )
  WITH CHECK (
    lead_id IN (SELECT id FROM pl_leads) AND contact_id IN (SELECT id FROM contacts)
  );

-- ───────────────────────────────────────────────────────────────────
-- terminal_contacts — the same Contacts follow a deal into its Terminal.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE terminal_contacts (
  terminal_id UUID NOT NULL REFERENCES terminals(id) ON DELETE CASCADE,
  contact_id  UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  role        TEXT,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (terminal_id, contact_id)
);
ALTER TABLE terminal_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "terminal_contacts_rw" ON terminal_contacts
  FOR ALL TO authenticated
  USING (
    terminal_id IN (SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid())
    AND contact_id IN (SELECT id FROM contacts)
  )
  WITH CHECK (
    terminal_id IN (SELECT terminal_id FROM terminal_members WHERE user_id = auth.uid())
    AND contact_id IN (SELECT id FROM contacts)
  );

-- ───────────────────────────────────────────────────────────────────
-- Now that pl_leads exists, wire up the deferred interactions.lead_id FK.
-- ───────────────────────────────────────────────────────────────────
ALTER TABLE interactions
  ADD CONSTRAINT interactions_lead_fk
  FOREIGN KEY (lead_id) REFERENCES pl_leads(id) ON DELETE CASCADE;

COMMIT;
