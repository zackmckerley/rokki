-- Contact ↔ Rokki-user linking.
--
-- Policy (Zack's call): auto-link a contact to a Rokki account when the contact
-- and the account share a SPACE (they're teammates); for an email match where
-- they DON'T share a space, surface a suggestion the owner confirms manually.
--
-- The link is `contacts.user_id` (already exists). We never merge/overwrite — the
-- owner's record stays theirs; the link just asserts "this person IS this account",
-- which the UI uses for a "Rokki" badge and (later) message/call-in-Rokki.
--
-- Matching key: the contact's denormalized `primary_email` vs the account email,
-- case-insensitively. All functions are SECURITY DEFINER (they must read
-- auth.users + write across owners for the teammate case), but every path is
-- pinned: the trigger fires only on real membership changes and links only on a
-- verified email match; the user-facing functions scope to auth.uid().

BEGIN;

-- Supports the case-insensitive email match below.
CREATE INDEX IF NOT EXISTS contacts_lower_email_idx
  ON contacts (lower(primary_email))
  WHERE primary_email IS NOT NULL;

-- ───────────────────────────────────────────────────────────────────
-- Reconcile links among the members of a space (both directions), by email.
-- Internal only — invoked by the join trigger + the one-time backfill. NOT
-- granted to clients, so nobody can call it with a forged (space,user) pair.
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION link_contacts_for_membership(p_space_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  joiner_email text;
BEGIN
  SELECT email INTO joiner_email FROM auth.users WHERE id = p_user_id;
  IF joiner_email IS NULL THEN RETURN; END IF;

  -- (a) Co-members' contacts that match the joiner's email → link to the joiner.
  UPDATE contacts c
     SET user_id = p_user_id
   WHERE c.user_id IS NULL
     AND c.primary_email IS NOT NULL
     AND lower(c.primary_email) = lower(joiner_email)
     AND c.owner_id IN (
       SELECT sm.user_id FROM space_members sm
        WHERE sm.space_id = p_space_id AND sm.user_id <> p_user_id
     );

  -- (b) The joiner's own contacts that match a co-member's email → link.
  UPDATE contacts c
     SET user_id = u.id
    FROM space_members sm
    JOIN auth.users u ON u.id = sm.user_id
   WHERE c.owner_id = p_user_id
     AND c.user_id IS NULL
     AND c.primary_email IS NOT NULL
     AND sm.space_id = p_space_id
     AND sm.user_id <> p_user_id
     AND u.email IS NOT NULL
     AND lower(c.primary_email) = lower(u.email);
END;
$$;

REVOKE ALL ON FUNCTION link_contacts_for_membership(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION trg_link_contacts_on_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM link_contacts_for_membership(NEW.space_id, NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS link_contacts_on_join ON space_members;
CREATE TRIGGER link_contacts_on_join
  AFTER INSERT ON space_members
  FOR EACH ROW EXECUTE FUNCTION trg_link_contacts_on_join();

-- ───────────────────────────────────────────────────────────────────
-- Suggestions: the caller's unlinked active contacts whose primary_email
-- matches some Rokki account (the non-teammate case the trigger didn't auto-
-- link). Scoped to auth.uid() — a user only ever sees suggestions for their
-- OWN contacts, and only the matched user_id (no profile data) is returned.
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION contact_link_suggestions()
RETURNS TABLE (contact_id uuid, user_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, u.id
    FROM contacts c
    JOIN auth.users u
      ON u.email IS NOT NULL
     AND lower(u.email) = lower(c.primary_email)
   WHERE c.owner_id = auth.uid()
     AND c.user_id IS NULL
     AND c.status = 'active'
     AND c.primary_email IS NOT NULL
     AND u.id <> auth.uid();
$$;

GRANT EXECUTE ON FUNCTION contact_link_suggestions() TO authenticated;

-- ───────────────────────────────────────────────────────────────────
-- Verified link: set contacts.user_id ONLY when the contact's email actually
-- matches the target account (prevents forging a link to an arbitrary user).
-- Owner-scoped. Returns true on success.
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION link_contact_to_user(p_contact_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM contacts c
      JOIN auth.users u ON u.id = p_user_id
     WHERE c.id = p_contact_id
       AND c.owner_id = auth.uid()
       AND c.primary_email IS NOT NULL
       AND u.email IS NOT NULL
       AND lower(c.primary_email) = lower(u.email)
  ) INTO matched;

  IF NOT matched THEN
    RETURN false;
  END IF;

  UPDATE contacts
     SET user_id = p_user_id
   WHERE id = p_contact_id AND owner_id = auth.uid();
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION link_contact_to_user(uuid, uuid) TO authenticated;

-- ───────────────────────────────────────────────────────────────────
-- Unlink: clear the link on the caller's own contact. Owner-scoped.
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION unlink_contact(p_contact_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE contacts SET user_id = NULL
   WHERE id = p_contact_id AND owner_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION unlink_contact(uuid) TO authenticated;

-- ───────────────────────────────────────────────────────────────────
-- One-time backfill: link contacts among everyone who is ALREADY a teammate.
-- ───────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT space_id, user_id FROM space_members LOOP
    PERFORM link_contacts_for_membership(r.space_id, r.user_id);
  END LOOP;
END;
$$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP TRIGGER IF EXISTS link_contacts_on_join ON space_members;
-- DROP FUNCTION IF EXISTS trg_link_contacts_on_join();
-- DROP FUNCTION IF EXISTS link_contacts_for_membership(uuid, uuid);
-- DROP FUNCTION IF EXISTS contact_link_suggestions();
-- DROP FUNCTION IF EXISTS link_contact_to_user(uuid, uuid);
-- DROP FUNCTION IF EXISTS unlink_contact(uuid);
-- DROP INDEX IF EXISTS contacts_lower_email_idx;
-- COMMIT;
