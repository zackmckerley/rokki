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
-- crypt() — local-dev only. Production seeds via the auth admin API,
-- not here.

DO $$
DECLARE
  _zack   UUID;
  _carlos UUID;
  _maria  UUID;
  _bank   UUID;
  _space  UUID;
  _term   UUID;
BEGIN
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud)
  VALUES (
    gen_random_uuid(),
    'zack@rokki.local',
    crypt('rokki-local-dev', gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated'
  )
  ON CONFLICT (email) DO NOTHING;
  SELECT id INTO _zack FROM auth.users WHERE email = 'zack@rokki.local';

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud)
  VALUES (
    gen_random_uuid(),
    'carlos@rokki.local',
    crypt('rokki-local-dev', gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated'
  )
  ON CONFLICT (email) DO NOTHING;
  SELECT id INTO _carlos FROM auth.users WHERE email = 'carlos@rokki.local';

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud)
  VALUES (
    gen_random_uuid(),
    'maria@rokki.local',
    crypt('rokki-local-dev', gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated'
  )
  ON CONFLICT (email) DO NOTHING;
  SELECT id INTO _maria FROM auth.users WHERE email = 'maria@rokki.local';

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud)
  VALUES (
    gen_random_uuid(),
    'bank@rokki.local',
    crypt('rokki-local-dev', gen_salt('bf')),
    now(),
    'authenticated',
    'authenticated'
  )
  ON CONFLICT (email) DO NOTHING;
  SELECT id INTO _bank FROM auth.users WHERE email = 'bank@rokki.local';

  INSERT INTO profiles (user_id, full_name, timezone, is_platform_admin)
  VALUES
    (_zack,   'Zack McKerley', 'America/New_York', TRUE),
    (_carlos, 'Carlos Rivera', 'America/New_York', FALSE),
    (_maria,  'Maria Santos',  'America/Denver',   FALSE),
    (_bank,   'First National Bank', 'UTC',        FALSE)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO spaces (id, slug, name, created_by)
  VALUES (gen_random_uuid(), 'helios', 'Helios AI', _zack)
  ON CONFLICT (slug) DO NOTHING;
  SELECT id INTO _space FROM spaces WHERE slug = 'helios';

  INSERT INTO space_members (space_id, user_id, role)
  VALUES
    (_space, _zack,   'owner'),
    (_space, _carlos, 'admin'),
    (_space, _maria,  'member'),
    (_space, _bank,   'member')
  ON CONFLICT (space_id, user_id) DO NOTHING;

  INSERT INTO terminals (id, space_id, ticker, name, description, type, status, created_by)
  VALUES (
    gen_random_uuid(),
    _space,
    'HLX',
    'Helios Launch',
    'Ship v1 — marketing site, onboarding flow, billing.',
    'project',
    'active',
    _zack
  )
  ON CONFLICT (space_id, ticker) DO NOTHING;
  SELECT id INTO _term FROM terminals WHERE space_id = _space AND ticker = 'HLX';

  INSERT INTO terminal_members (terminal_id, user_id, role)
  VALUES
    (_term, _zack,   'owner'),
    (_term, _carlos, 'manager'),
    (_term, _maria,  'architect')
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
