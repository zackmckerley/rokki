-- Rokki seed data — creates 4 canonical test users + a demo space + a
-- demo terminal for local dev and E2E tests. Runs after `supabase db
-- reset`.
--
-- Users:
--   zack@rokki.local     → platform admin
--   carlos@rokki.local   → space owner
--   maria@rokki.local    → space admin
--   bank@rokki.local     → space member (guest-style)
--
-- All share the password `rokki-local-dev` via Supabase's internal
-- crypt() — local-dev only. Production seeds via the auth admin API.
--
-- auth.users has no unique constraint on `email` (only a partial unique
-- index for non-deleted rows), so we can't ON CONFLICT (email). Use an
-- IF-NOT-EXISTS per-user pattern instead. Child tables (profiles, spaces,
-- memberships) have proper PKs — ON CONFLICT works there.

DO $$
DECLARE
  _zack   UUID;
  _carlos UUID;
  _maria  UUID;
  _bank   UUID;
  _space  UUID;
  _term   UUID;
BEGIN
  -- Users ---------------------------------------------------------------
  SELECT id INTO _zack FROM auth.users WHERE email = 'zack@rokki.local';
  IF _zack IS NULL THEN
    _zack := gen_random_uuid();
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud)
    VALUES (_zack, 'zack@rokki.local', crypt('rokki-local-dev', gen_salt('bf')), now(), 'authenticated', 'authenticated');
  END IF;

  SELECT id INTO _carlos FROM auth.users WHERE email = 'carlos@rokki.local';
  IF _carlos IS NULL THEN
    _carlos := gen_random_uuid();
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud)
    VALUES (_carlos, 'carlos@rokki.local', crypt('rokki-local-dev', gen_salt('bf')), now(), 'authenticated', 'authenticated');
  END IF;

  SELECT id INTO _maria FROM auth.users WHERE email = 'maria@rokki.local';
  IF _maria IS NULL THEN
    _maria := gen_random_uuid();
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud)
    VALUES (_maria, 'maria@rokki.local', crypt('rokki-local-dev', gen_salt('bf')), now(), 'authenticated', 'authenticated');
  END IF;

  SELECT id INTO _bank FROM auth.users WHERE email = 'bank@rokki.local';
  IF _bank IS NULL THEN
    _bank := gen_random_uuid();
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud)
    VALUES (_bank, 'bank@rokki.local', crypt('rokki-local-dev', gen_salt('bf')), now(), 'authenticated', 'authenticated');
  END IF;

  -- Profiles ------------------------------------------------------------
  INSERT INTO profiles (user_id, full_name, timezone, is_platform_admin)
  VALUES
    (_zack,   'Zack McKerley', 'America/New_York', TRUE),
    (_carlos, 'Carlos Rivera', 'America/New_York', FALSE),
    (_maria,  'Maria Santos',  'America/Denver',   FALSE),
    (_bank,   'First National Bank', 'UTC',        FALSE)
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        timezone = EXCLUDED.timezone,
        is_platform_admin = EXCLUDED.is_platform_admin;

  -- Demo space + memberships -------------------------------------------
  SELECT id INTO _space FROM spaces WHERE slug = 'helios';
  IF _space IS NULL THEN
    _space := gen_random_uuid();
    INSERT INTO spaces (id, slug, name, created_by)
    VALUES (_space, 'helios', 'Helios AI', _zack);
  END IF;

  INSERT INTO space_members (space_id, user_id, role)
  VALUES
    (_space, _zack,   'owner'),
    (_space, _carlos, 'admin'),
    (_space, _maria,  'member'),
    (_space, _bank,   'member')
  ON CONFLICT (space_id, user_id) DO NOTHING;

  -- Demo terminal + memberships + sample tasks -------------------------
  SELECT id INTO _term FROM terminals WHERE space_id = _space AND ticker = 'HLX';
  IF _term IS NULL THEN
    _term := gen_random_uuid();
    INSERT INTO terminals (id, space_id, ticker, name, description, type, status, created_by)
    VALUES (_term, _space, 'HLX', 'Helios Launch', 'Ship v1 — marketing site, onboarding flow, billing.', 'project', 'active', _zack);
  END IF;

  INSERT INTO terminal_members (terminal_id, user_id, role, added_by)
  VALUES
    (_term, _zack,   'owner',     _zack),
    (_term, _carlos, 'manager',   _zack),
    (_term, _maria,  'architect', _zack)
  ON CONFLICT (terminal_id, user_id) DO NOTHING;

  INSERT INTO tasks (terminal_id, ticker_seq, title, status, priority, created_by)
  VALUES
    (_term, 1, 'Draft pricing page copy', 'in_progress', 2, _zack),
    (_term, 2, 'Wire up Stripe checkout', 'todo', 2, _carlos),
    (_term, 3, 'Dry run onboarding walkthrough', 'todo', 3, _maria)
  ON CONFLICT (terminal_id, ticker_seq) DO NOTHING;
END $$;

SELECT
  (SELECT COUNT(*) FROM auth.users WHERE email LIKE '%@rokki.local') AS users,
  (SELECT COUNT(*) FROM spaces) AS spaces,
  (SELECT COUNT(*) FROM terminals) AS terminals,
  (SELECT COUNT(*) FROM tasks) AS tasks;
