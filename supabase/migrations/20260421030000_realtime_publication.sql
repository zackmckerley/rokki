-- Publish tables to Supabase Realtime.
--
-- The supabase_realtime publication already exists in the default schema;
-- we're just naming which tables should stream change events. Each panel
-- in the web app needs realtime awareness of one or more of these.
--
-- RLS still applies at subscribe time (Realtime pipes events through the
-- same policies as SELECT), so we can safely publish tables that are
-- strictly scoped to the user's org/project.

ALTER PUBLICATION supabase_realtime ADD TABLE activity;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE files;
ALTER PUBLICATION supabase_realtime ADD TABLE folders;
ALTER PUBLICATION supabase_realtime ADD TABLE project_members;
ALTER PUBLICATION supabase_realtime ADD TABLE invites;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
