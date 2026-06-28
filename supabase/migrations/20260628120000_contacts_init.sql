-- Contacts module — the relationship layer.
--
-- A user-owned, cross-space contact book (people you deal with: owners, brokers,
-- partners, lenders, attorneys, GCs, and your own teammates). Foundational: the
-- Pipeline module's leads and Terminals LINK to these records rather than
-- embedding their own copies, so one person is one record everywhere and a note
-- logged on a deal also lands on that person's timeline.
--
-- Scope: each contact is owned by a user (your global network). Team members are
-- contacts whose `user_id` points at a Rokki profile (synced from it). Wider
-- space-visibility (a contact becoming visible to a space's members because it's
-- linked to a lead there) is layered on in a later phase via the link tables.
--
-- See Claude/CONTACTS_PIPELINE_BUILD_PLAN.md.

BEGIN;

-- ───────────────────────────────────────────────────────────────────
-- contacts — one person. Multi-value reach (emails/phones/addresses/socials)
-- lives in JSONB for MVP flexibility; the primary email/phone are denormalized
-- into columns for dedupe + fast search.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE contacts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- linked Rokki user (team contact)
  first_name     TEXT NOT NULL DEFAULT '',
  middle_name    TEXT,
  last_name      TEXT NOT NULL DEFAULT '',
  prefix         TEXT,
  suffix         TEXT,
  nickname       TEXT,
  avatar_url     TEXT,
  contact_types  TEXT[] NOT NULL DEFAULT '{}',     -- owner|broker|partner|lender|attorney|...
  tags           TEXT[] NOT NULL DEFAULT '{}',
  title          TEXT,
  firm           TEXT,
  license_no     TEXT,
  strength       INT  NOT NULL DEFAULT 0 CHECK (strength BETWEEN 0 AND 3),
  source         TEXT,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  do_not_contact BOOLEAN NOT NULL DEFAULT FALSE,
  notes          TEXT,
  emails         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{email,label,primary}]
  phones         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{phone,label,primary}]
  addresses      JSONB NOT NULL DEFAULT '[]'::jsonb,
  socials        JSONB NOT NULL DEFAULT '[]'::jsonb,
  primary_email  TEXT,
  primary_phone  TEXT,
  custom         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- a contact must carry at least one name character
  CONSTRAINT contacts_has_name
    CHECK (char_length(coalesce(first_name,'') || coalesce(last_name,'') || coalesce(nickname,'')) BETWEEN 1 AND 300)
);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contacts_own" ON contacts
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX contacts_owner_idx        ON contacts(owner_id);
CREATE INDEX contacts_owner_email_idx  ON contacts(owner_id, primary_email);
CREATE INDEX contacts_owner_phone_idx  ON contacts(owner_id, primary_phone);
CREATE INDEX contacts_user_idx         ON contacts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX contacts_tags_idx         ON contacts USING GIN (tags);
CREATE INDEX contacts_types_idx        ON contacts USING GIN (contact_types);

-- ───────────────────────────────────────────────────────────────────
-- interactions — the shared activity timeline. A row can reference a contact
-- AND a lead AND/OR a terminal, so the same note aggregates onto every relevant
-- timeline. `due_at` (with done_at NULL) makes it a follow-up reminder.
-- `lead_id` is intentionally FK-less here — pl_leads is created by the Pipeline
-- migration, which will add the constraint.
-- ───────────────────────────────────────────────────────────────────
CREATE TABLE interactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  space_id    UUID REFERENCES spaces(id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES contacts(id) ON DELETE CASCADE,
  lead_id     UUID,
  terminal_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'note'
                CHECK (type IN ('note','call','email','meeting','text','site_visit','offer','stage_change','follow_up')),
  body        TEXT NOT NULL DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at      TIMESTAMPTZ,
  done_at     TIMESTAMPTZ,
  created_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

-- Readable if you own it, you created it, it's in one of your spaces, or it's
-- about one of your contacts (which RLS already scopes to you).
CREATE POLICY "interactions_read" ON interactions
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR created_by = auth.uid()
    OR (space_id IN (SELECT space_id FROM space_members WHERE user_id = auth.uid()))
    OR (contact_id IN (SELECT id FROM contacts))
  );

CREATE POLICY "interactions_write" ON interactions
  FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR created_by = auth.uid())
  WITH CHECK (owner_id = auth.uid() OR created_by = auth.uid());

CREATE INDEX interactions_contact_idx  ON interactions(contact_id, occurred_at DESC);
CREATE INDEX interactions_lead_idx     ON interactions(lead_id, occurred_at DESC);
CREATE INDEX interactions_terminal_idx ON interactions(terminal_id, occurred_at DESC);
CREATE INDEX interactions_followup_idx ON interactions(owner_id, due_at)
  WHERE due_at IS NOT NULL AND done_at IS NULL;

-- ───────────────────────────────────────────────────────────────────
-- updated_at touch trigger for contacts
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION contacts_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_set_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_touch_updated_at();

COMMIT;
