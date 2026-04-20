-- Domain events: an append-only log of every meaningful state transition
-- so downstream systems (webhooks, analytics, audit exports, future
-- replayable projections) can subscribe without coupling to the source
-- tables.
--
-- This is deliberately separate from `activity` — `activity` is a user-
-- facing feed that we summarise in the UI. `domain_events` is a machine-
-- readable event log with richer payloads. The two share origin (an
-- emitter writes both) but serve different audiences.

CREATE TABLE domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Dotted event name: 'task.created', 'terminal.created', 'file.uploaded', etc.
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 3 AND 120),
  -- Who caused it (null for system-originated events).
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_token_id UUID REFERENCES access_tokens(id) ON DELETE SET NULL,
  -- Where it happened — redundant with payload for indexability.
  space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  terminal_id UUID REFERENCES terminals(id) ON DELETE CASCADE,
  -- The thing the event is about.
  entity_type TEXT,
  entity_id UUID,
  -- Structured payload. Whatever the emitter wants to publish.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Monotonic sequence for ordered replay.
  sequence BIGSERIAL NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_domain_events_space_time ON domain_events(space_id, occurred_at DESC);
CREATE INDEX idx_domain_events_terminal_time ON domain_events(terminal_id, occurred_at DESC);
CREATE INDEX idx_domain_events_name_time ON domain_events(name, occurred_at DESC);
CREATE INDEX idx_domain_events_sequence ON domain_events(sequence);

ALTER TABLE domain_events ENABLE ROW LEVEL SECURITY;

-- Read: scoped the same way as activity — visible if I see the terminal
-- or I'm in the space. Platform admins see everything for audit.
CREATE POLICY "domain_events_select" ON domain_events
  FOR SELECT TO authenticated
  USING (
    (terminal_id IS NOT NULL AND is_terminal_member(terminal_id))
    OR (space_id IS NOT NULL AND is_space_member(space_id))
    OR actor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE user_id = auth.uid() AND is_platform_admin = true
    )
  );

-- Writes always come through service-role (the emitter on the server).
-- No INSERT policy for authenticated users.

ALTER PUBLICATION supabase_realtime ADD TABLE domain_events;
