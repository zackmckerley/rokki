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
  _admin  UUID;
  _zack   UUID;
  _carlos UUID;
  _maria  UUID;
  _bank   UUID;
  _space  UUID;
  _term   UUID;
BEGIN
  -- --------------------------------------------------------------------
  -- Username-based admin login (admin / Pringles2191)
  --
  -- We store a real user in auth.users with the pseudo-email
  -- admin@rokki.local; the password-login endpoint maps the username
  -- "admin" -> that email before calling signInWithPassword. The hash
  -- uses crypt(..., gen_salt('bf')) — the same bcrypt format Supabase
  -- Auth uses — so Supabase accepts the password at sign-in.
  --
  -- Local-dev only. For production, either set a different password via
  -- the auth admin API or disable the password-login endpoint via env.
  -- --------------------------------------------------------------------
  SELECT id INTO _admin FROM auth.users WHERE email = 'admin@rokki.local';
  IF _admin IS NULL THEN
    _admin := gen_random_uuid();
    -- GoTrue's Go scanner can't convert NULL -> string for a handful of
    -- legacy columns, so we seed them as empty strings. Without this,
    -- any GoTrue endpoint that touches this user errors with
    --   sql: Scan error on column index 3, name "confirmation_token":
    --   converting NULL to string is unsupported
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      role, aud,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, phone_change, phone_change_token,
      email_change_token_current,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    VALUES (
      _admin,
      '00000000-0000-0000-0000-000000000000',
      'admin@rokki.local',
      crypt('Pringles2191', gen_salt('bf')),
      now(),
      'authenticated', 'authenticated',
      '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(), now()
    );
  ELSE
    UPDATE auth.users
    SET encrypted_password = crypt('Pringles2191', gen_salt('bf'))
    WHERE id = _admin;
  END IF;

  -- GoTrue requires a matching row in auth.identities with provider='email'
  -- for signInWithPassword to work. A direct auth.users insert skips this,
  -- so we create it explicitly. Timestamps must be non-null; GoTrue's Go
  -- scanner also can't coerce NULL -> *time.Time.
  INSERT INTO auth.identities (user_id, provider, provider_id, identity_data, created_at, updated_at, last_sign_in_at)
  VALUES (
    _admin,
    'email',
    _admin::text,
    jsonb_build_object('sub', _admin::text, 'email', 'admin@rokki.local', 'email_verified', true),
    now(), now(), now()
  )
  ON CONFLICT (provider_id, provider) DO NOTHING;

  -- Users ---------------------------------------------------------------
  -- Helper DRY-ish: same empty-string pattern as the admin user so
  -- GoTrue's scanner doesn't choke on NULL-to-string conversions.
  SELECT id INTO _zack FROM auth.users WHERE email = 'zack@rokki.local';
  IF _zack IS NULL THEN
    _zack := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      role, aud, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    VALUES (
      _zack, '00000000-0000-0000-0000-000000000000',
      'zack@rokki.local', crypt('rokki-local-dev', gen_salt('bf')),
      now(), 'authenticated', 'authenticated',
      '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    );
  END IF;

  SELECT id INTO _carlos FROM auth.users WHERE email = 'carlos@rokki.local';
  IF _carlos IS NULL THEN
    _carlos := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      role, aud, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    VALUES (
      _carlos, '00000000-0000-0000-0000-000000000000',
      'carlos@rokki.local', crypt('rokki-local-dev', gen_salt('bf')),
      now(), 'authenticated', 'authenticated',
      '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    );
  END IF;

  SELECT id INTO _maria FROM auth.users WHERE email = 'maria@rokki.local';
  IF _maria IS NULL THEN
    _maria := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      role, aud, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    VALUES (
      _maria, '00000000-0000-0000-0000-000000000000',
      'maria@rokki.local', crypt('rokki-local-dev', gen_salt('bf')),
      now(), 'authenticated', 'authenticated',
      '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    );
  END IF;

  SELECT id INTO _bank FROM auth.users WHERE email = 'bank@rokki.local';
  IF _bank IS NULL THEN
    _bank := gen_random_uuid();
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      role, aud, confirmation_token, recovery_token,
      email_change_token_new, email_change, phone_change,
      phone_change_token, email_change_token_current,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at
    )
    VALUES (
      _bank, '00000000-0000-0000-0000-000000000000',
      'bank@rokki.local', crypt('rokki-local-dev', gen_salt('bf')),
      now(), 'authenticated', 'authenticated',
      '', '', '', '', '', '', '',
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now()
    );
  END IF;

  -- Profiles ------------------------------------------------------------
  INSERT INTO profiles (user_id, full_name, timezone, is_platform_admin)
  VALUES
    (_admin,  'Admin',         'America/New_York', TRUE),
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
