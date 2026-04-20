-- Dev-only helper to observe auth.uid() from the client.
-- Safe because it only reads the caller's own UID; no privileged info.
CREATE OR REPLACE FUNCTION public.get_auth_uid()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_uid() TO anon, authenticated;

-- ROLLBACK: DROP FUNCTION public.get_auth_uid();
