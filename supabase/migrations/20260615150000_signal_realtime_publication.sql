-- Publish the Signal tables to Supabase Realtime.
--
-- The Phase-0 migration (20260615130000_signal_integration.sql) created these
-- tables but didn't stream them. The bridge writes inbound messages and flips
-- link status via the service role; publishing here lets the Messages module
-- and the Connect-Signal settings page update live as that happens.
--
-- RLS still applies at subscribe time (Realtime pipes events through the same
-- policies as SELECT), and every signal_* row is scoped to its owner, so each
-- socket only ever sees its own account's events.

ALTER PUBLICATION supabase_realtime ADD TABLE signal_accounts;
ALTER PUBLICATION supabase_realtime ADD TABLE signal_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE signal_messages;

-- ROLLBACK:
-- ALTER PUBLICATION supabase_realtime DROP TABLE signal_messages;
-- ALTER PUBLICATION supabase_realtime DROP TABLE signal_threads;
-- ALTER PUBLICATION supabase_realtime DROP TABLE signal_accounts;
