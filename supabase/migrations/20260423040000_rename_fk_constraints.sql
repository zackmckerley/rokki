-- ALTER TABLE RENAME TO preserves FK constraint NAMES (they carry over as
-- `org_members_org_id_fkey`, `projects_org_id_fkey`, etc.). The Supabase
-- REST layer uses constraint names as relationship "hints", so our
-- `.select("spaces!space_members_space_id_fkey(...)")` calls fail with
-- PGRST200. Rename every constraint to the new table/column names.

ALTER TABLE space_members
  RENAME CONSTRAINT org_members_org_id_fkey TO space_members_space_id_fkey;
ALTER TABLE space_members
  RENAME CONSTRAINT org_members_user_id_fkey TO space_members_user_id_fkey;

ALTER TABLE terminals
  RENAME CONSTRAINT projects_org_id_fkey TO terminals_space_id_fkey;

ALTER TABLE terminal_members
  RENAME CONSTRAINT project_members_project_id_fkey TO terminal_members_terminal_id_fkey;
ALTER TABLE terminal_members
  RENAME CONSTRAINT project_members_user_id_fkey TO terminal_members_user_id_fkey;

ALTER TABLE tasks
  RENAME CONSTRAINT tasks_project_id_fkey TO tasks_terminal_id_fkey;

ALTER TABLE files
  RENAME CONSTRAINT files_project_id_fkey TO files_terminal_id_fkey;

ALTER TABLE folders
  RENAME CONSTRAINT folders_project_id_fkey TO folders_terminal_id_fkey;

ALTER TABLE file_chunks
  RENAME CONSTRAINT file_chunks_project_id_fkey TO file_chunks_terminal_id_fkey;

ALTER TABLE comments
  RENAME CONSTRAINT comments_project_id_fkey TO comments_terminal_id_fkey;

ALTER TABLE activity
  RENAME CONSTRAINT activity_org_id_fkey TO activity_space_id_fkey;
ALTER TABLE activity
  RENAME CONSTRAINT activity_project_id_fkey TO activity_terminal_id_fkey;

ALTER TABLE invites
  RENAME CONSTRAINT invites_org_id_fkey TO invites_space_id_fkey;
ALTER TABLE invites
  RENAME CONSTRAINT invites_project_id_fkey TO invites_terminal_id_fkey;

ALTER TABLE tool_invocations
  RENAME CONSTRAINT tool_invocations_project_id_fkey TO tool_invocations_terminal_id_fkey;

ALTER TABLE notifications
  RENAME CONSTRAINT notifications_project_id_fkey TO notifications_terminal_id_fkey;

ALTER TABLE tools
  RENAME CONSTRAINT tools_owner_org_id_fkey TO tools_owner_space_id_fkey;

-- Tell PostgREST to refresh its schema cache so the hints work immediately.
NOTIFY pgrst, 'reload schema';
