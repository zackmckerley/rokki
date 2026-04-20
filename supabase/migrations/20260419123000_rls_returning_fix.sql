-- Fix: INSERT ... RETURNING on orgs/projects fails because the SELECT policy
-- runs before the AFTER trigger adds the creator as a member. Add creator
-- visibility to the SELECT policies so the RETURNING clause can see the row
-- immediately. Same for projects.

DROP POLICY IF EXISTS "orgs_select" ON orgs;
CREATE POLICY "orgs_select" ON orgs FOR SELECT TO authenticated
USING (
  is_org_member(id)
  OR created_by = auth.uid()
  OR has_emergency_access()
);

DROP POLICY IF EXISTS "projects_select" ON projects;
CREATE POLICY "projects_select" ON projects FOR SELECT TO authenticated
USING (
  is_project_member(id)
  OR created_by = auth.uid()
  OR has_emergency_access()
);

-- ROLLBACK: restore the original policies from 20260419120000_initial_schema.sql
