-- Allow writing Rokki tasks back to the user's calendar. Opt-in per
-- connection — we never push events to a calendar the user didn't
-- explicitly grant write access to.
--
-- `write_calendar_id` stores which calendar to write to (null = "primary"
-- for Google, default folder for Outlook).

ALTER TABLE calendar_connections
  ADD COLUMN IF NOT EXISTS allow_write BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS write_calendar_id TEXT;

-- Tracks an event we've pushed so we can update it later instead of
-- creating duplicates. Keyed by (connection, task) because every task-level
-- write shows up as exactly one event per connection.
CREATE TABLE calendar_event_writes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID NOT NULL REFERENCES calendar_connections(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  provider_event_id TEXT NOT NULL,
  last_pushed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (connection_id, task_id)
);

CREATE INDEX idx_calendar_event_writes_task ON calendar_event_writes(task_id);
