-- Soft-deleted files need to remain visible to uploader + project members so
-- the Trash view can render and soft-delete UPDATEs can succeed (RLS RETURNING
-- evaluates SELECT after the UPDATE sets deleted_at).
--
-- Moving the deleted_at filter out of can_see_file and into app-level queries.

CREATE OR REPLACE FUNCTION can_see_file(_file files)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT is_project_member(_file.project_id) THEN false
    WHEN _file.visibility = 'project' THEN true
    WHEN _file.visibility = 'owners' THEN is_project_manager(_file.project_id)
    WHEN _file.visibility = 'custom' THEN
      auth.uid() = ANY(_file.visibility_users)
      OR project_role(_file.project_id) = ANY(_file.visibility_roles)
    ELSE false
  END;
$$;

-- ROLLBACK: restore the deleted_at filter in can_see_file.
