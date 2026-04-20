-- The RLS helper functions previously used SECURITY INVOKER, which meant calls
-- from inside RLS policies re-triggered the policy on the helper's own query →
-- infinite recursion → "stack depth limit exceeded".
--
-- Fix: SECURITY DEFINER on all membership helpers so their internal lookups
-- run as the function owner and don't re-apply RLS. They still return values
-- scoped to the caller via auth.uid().

CREATE OR REPLACE FUNCTION is_org_member(_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = _org AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION is_org_admin(_org UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = _org AND user_id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION is_project_member(_project UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = _project AND user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = _project
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION project_role(_project UUID)
RETURNS project_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM project_members
  WHERE project_id = _project AND user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_project_manager(_project UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT project_role(_project) IN ('owner', 'manager')
  OR EXISTS (
    SELECT 1 FROM projects p
    JOIN org_members om ON om.org_id = p.org_id
    WHERE p.id = _project
      AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION can_see_file(_file files)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN NOT is_project_member(_file.project_id) THEN false
    WHEN _file.deleted_at IS NOT NULL THEN false
    WHEN _file.visibility = 'project' THEN true
    WHEN _file.visibility = 'owners' THEN is_project_manager(_file.project_id)
    WHEN _file.visibility = 'custom' THEN
      auth.uid() = ANY(_file.visibility_users)
      OR project_role(_file.project_id) = ANY(_file.visibility_roles)
    ELSE false
  END;
$$;

-- Grant execute explicitly to authenticated callers
GRANT EXECUTE ON FUNCTION is_org_member(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_org_admin(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_project_member(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION project_role(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION is_project_manager(UUID) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION can_see_file(files) TO authenticated, anon;

-- ROLLBACK: restore SECURITY INVOKER versions from 20260419120000_initial_schema.sql
