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
  -- Only confirmed accounts auto-link (an unconfirmed signup on someone's
  -- email must not silently claim a contact).
  SELECT email INTO joiner_email
    FROM auth.users
   WHERE id = p_user_id AND email_confirmed_at IS NOT NULL;
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
  -- DISTINCT ON keeps it deterministic if two accounts share an email.
  UPDATE contacts c
     SET user_id = m.user_id
    FROM (
      SELECT DISTINCT ON (lower(u.email)) lower(u.email) AS email, sm.user_id
        FROM space_members sm
        JOIN auth.users u ON u.id = sm.user_id
       WHERE sm.space_id = p_space_id
         AND sm.user_id <> p_user_id
         AND u.email IS NOT NULL
         AND u.email_confirmed_at IS NOT NULL
       ORDER BY lower(u.email), u.created_at
    ) m
   WHERE c.owner_id = p_user_id
     AND c.user_id IS NULL
     AND c.primary_email IS NOT NULL
     AND lower(c.primary_email) = m.email;
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
-- matches some confirmed Rokki account (the non-teammate case the trigger
-- didn't auto-link). Scoped to auth.uid() — a user only ever sees their OWN
-- contacts. Deliberately returns ONLY the contact id: never the matched
-- account's UUID, so this can't be used as an email→account-id oracle. The
-- actual link is resolved server-side by email (link_contact_by_email).
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION contact_link_suggestions()
RETURNS TABLE (contact_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
    FROM contacts c
   WHERE c.owner_id = auth.uid()
     AND c.user_id IS NULL
     AND c.status = 'active'
     AND c.primary_email IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM auth.users u
        WHERE u.email IS NOT NULL
          AND u.email_confirmed_at IS NOT NULL
          AND u.id <> auth.uid()
          AND lower(u.email) = lower(c.primary_email)
     );
$$;

GRANT EXECUTE ON FUNCTION contact_link_suggestions() TO authenticated;

-- ───────────────────────────────────────────────────────────────────
-- Link by email: link the caller's own contact to whatever confirmed account
-- its primary_email resolves to. The caller never supplies (or learns) the
-- account UUID — the server picks it — so there's no link to forge and no
-- account-id oracle. DISTINCT-by-email determinism via ORDER BY. Returns true
-- when a link was made.
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION link_contact_by_email(p_contact_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_user uuid;
BEGIN
  SELECT primary_email INTO v_email
    FROM contacts
   WHERE id = p_contact_id AND owner_id = auth.uid();
  IF v_email IS NULL THEN
    RETURN false;
  END IF;

  SELECT id INTO v_user
    FROM auth.users
   WHERE email IS NOT NULL
     AND email_confirmed_at IS NOT NULL
     AND id <> auth.uid()
     AND lower(email) = lower(v_email)
   ORDER BY email_confirmed_at, created_at
   LIMIT 1;
  IF v_user IS NULL THEN
    RETURN false;
  END IF;

  UPDATE contacts
     SET user_id = v_user
   WHERE id = p_contact_id AND owner_id = auth.uid();
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION link_contact_by_email(uuid) TO authenticated;

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
-- DB-level guard: contacts.user_id may be set/changed ONLY by the linking
-- functions above (which run as the table owner under SECURITY DEFINER). A
-- direct write from the `authenticated` role — i.e. a client create/update —
-- can't touch user_id. This enforces the "verified-link-only" rule at the
-- database, not just in the app's WRITABLE whitelist.
-- ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION contacts_guard_user_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' AND NEW.user_id IS NOT NULL THEN
      RAISE EXCEPTION 'contacts.user_id is managed by the link API only';
    ELSIF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'contacts.user_id is managed by the link API only';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_guard_user_id_biu ON contacts;
CREATE TRIGGER contacts_guard_user_id_biu
  BEFORE INSERT OR UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION contacts_guard_user_id();

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
-- DROP TRIGGER IF EXISTS contacts_guard_user_id_biu ON contacts;
-- DROP FUNCTION IF EXISTS contacts_guard_user_id();
-- DROP TRIGGER IF EXISTS link_contacts_on_join ON space_members;
-- DROP FUNCTION IF EXISTS trg_link_contacts_on_join();
-- DROP FUNCTION IF EXISTS link_contacts_for_membership(uuid, uuid);
-- DROP FUNCTION IF EXISTS contact_link_suggestions();
-- DROP FUNCTION IF EXISTS link_contact_by_email(uuid);
-- DROP FUNCTION IF EXISTS unlink_contact(uuid);
-- DROP INDEX IF EXISTS contacts_lower_email_idx;
-- COMMIT;
