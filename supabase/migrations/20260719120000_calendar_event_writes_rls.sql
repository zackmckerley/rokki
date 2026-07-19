-- Fix: calendar_event_writes (created in 20260426070000_calendar_write.sql)
-- shipped WITHOUT row-level security — the only table in the schema missing it.
--
-- On Supabase's hosted platform the `authenticated` role holds default grants
-- on public tables, so with RLS disabled any signed-in user could read (and
-- write) EVERY row via PostgREST: a cross-tenant leak of other users'
-- task <-> calendar-event mappings, provider event ids, and connection ids,
-- plus the ability to delete/rewrite them and break another user's calendar
-- sync de-duplication.
--
-- Enable RLS and scope reads to the owner of the parent calendar_connection,
-- mirroring calendar_events (20260424040000_calendar_sync.sql). All writes to
-- this table go through the service-role sync writer, which bypasses RLS, so
-- no user-level INSERT/UPDATE/DELETE policy is needed (default-deny is correct
-- and least-privilege).

ALTER TABLE calendar_event_writes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_event_writes_select" ON calendar_event_writes
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM calendar_connections cc
      WHERE cc.id = calendar_event_writes.connection_id
        AND cc.user_id = auth.uid()
    )
  );

-- ROLLBACK:
-- DROP POLICY "calendar_event_writes_select" ON calendar_event_writes;
-- ALTER TABLE calendar_event_writes DISABLE ROW LEVEL SECURITY;
