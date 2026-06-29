-- Self-contact — every Rokki user is a Contact in their own contact book.
--
-- "My own contact should already be in Contacts because I'm a Rokki user."
-- We create exactly one self-contact per user: a row owned by the user AND
-- linked to the user (owner_id = user_id = the user). That single identity lets
-- the user be referenced like anyone else (assigned, messaged, shown on a deal),
-- and the existing teammate-linking machinery already understands a linked
-- contact.
--
-- `owner_id = user_id` IS the self-contact marker — no new column. contacts.user_id
-- is only ever set to OTHER accounts by the link API (the link functions match on
-- id <> auth.uid()), so a row where owner_id = user_id can only be a self-contact.
-- A partial unique index enforces at most one per user.
--
-- Creation bypasses the contacts_guard_user_id trigger (which blocks only the
-- `authenticated` role from writing user_id) because ensure_self_contact() is
-- SECURITY DEFINER and runs as the table owner. Fired at signup via a trigger on
-- profiles (so full_name/avatar are available), and backfilled for existing users.

BEGIN;

-- At most one self-contact per owner.
CREATE UNIQUE INDEX IF NOT EXISTS contacts_self_uniq
  ON contacts (owner_id)
  WHERE owner_id = user_id;

-- Create p_user_id's self-contact if absent. INTERNAL — never granted to clients
-- (the param is a user id, so a client must not be able to forge one). Idempotent.
CREATE OR REPLACE FUNCTION ensure_self_contact(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email  text;
  v_full   text;
  v_avatar text;
  v_first  text;
  v_last   text;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM contacts WHERE owner_id = p_user_id AND user_id = p_user_id
  ) THEN
    RETURN;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;
  SELECT full_name, avatar_url INTO v_full, v_avatar
    FROM profiles WHERE user_id = p_user_id;

  -- first name = first word of full_name, else the email local-part, else 'Me'.
  v_first := NULLIF(split_part(coalesce(v_full, ''), ' ', 1), '');
  IF v_first IS NULL THEN
    v_first := NULLIF(split_part(coalesce(v_email, ''), '@', 1), '');
  END IF;
  IF v_first IS NULL THEN
    v_first := 'Me';
  END IF;

  -- last name = everything after the first space of full_name (empty if none).
  IF position(' ' in coalesce(v_full, '')) > 0 THEN
    v_last := trim(substring(v_full FROM position(' ' in v_full) + 1));
  ELSE
    v_last := '';
  END IF;

  INSERT INTO contacts (
    owner_id, user_id, first_name, last_name, avatar_url,
    source, primary_email, emails
  )
  VALUES (
    p_user_id, p_user_id, v_first, coalesce(v_last, ''), v_avatar,
    'self', v_email,
    CASE
      WHEN v_email IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(jsonb_build_object('email', v_email, 'primary', true))
    END
  )
  ON CONFLICT DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION ensure_self_contact(uuid) FROM PUBLIC;

-- Fire at signup: handle_new_user() inserts the profile → this creates the
-- matching self-contact in the same transaction.
CREATE OR REPLACE FUNCTION trg_ensure_self_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM ensure_self_contact(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_self_contact_on_profile ON profiles;
CREATE TRIGGER ensure_self_contact_on_profile
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_ensure_self_contact();

-- One-time backfill for everyone who already has a profile.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT user_id FROM profiles LOOP
    PERFORM ensure_self_contact(r.user_id);
  END LOOP;
END;
$$;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP TRIGGER IF EXISTS ensure_self_contact_on_profile ON profiles;
-- DROP FUNCTION IF EXISTS trg_ensure_self_contact();
-- DROP FUNCTION IF EXISTS ensure_self_contact(uuid);
-- DELETE FROM contacts WHERE owner_id = user_id AND source = 'self';
-- DROP INDEX IF EXISTS contacts_self_uniq;
-- COMMIT;
