-- Wave-3 admin polish:
--   announcements + announcement_dismissals — platform-wide messages
--   feature_flags                          — typed key/value with scopes
--   webhook_destinations + webhook_deliveries — outbound event hooks
--   platform_config                       — branding, legal text, defaults
--   files.deleted_by                      — keep restore audit traceable

-- ============================================================================
-- Announcements
-- ============================================================================
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  audience TEXT NOT NULL DEFAULT 'all'
    CHECK (audience IN ('all', 'admins', 'space')),
  audience_space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  dismissible BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_active
  ON announcements(starts_at)
  WHERE ends_at IS NULL OR ends_at > now();

CREATE TABLE announcement_dismissals (
  announcement_id UUID NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_dismissals ENABLE ROW LEVEL SECURITY;

-- Anyone can read; the API filters by audience before returning.
CREATE POLICY "ann_read_all" ON announcements
  FOR SELECT TO authenticated USING (true);
-- Writes: platform admins only.
CREATE POLICY "ann_admin_write" ON announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_platform_admin
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_platform_admin
    )
  );

CREATE POLICY "annd_self" ON announcement_dismissals
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================================
-- Feature flags
-- ============================================================================
CREATE TABLE feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global', 'space', 'user')),
  scope_id UUID,
  value JSONB NOT NULL,
  rollout_percentage INT NOT NULL DEFAULT 100 CHECK (rollout_percentage BETWEEN 0 AND 100),
  description TEXT,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key, scope, scope_id)
);

CREATE INDEX idx_feature_flags_key ON feature_flags(key);

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
-- Read: any authenticated user (clients need to read their flag values)
CREATE POLICY "ff_read" ON feature_flags
  FOR SELECT TO authenticated USING (true);
-- Write: platform admins only
CREATE POLICY "ff_admin_write" ON feature_flags
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_platform_admin
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_platform_admin
    )
  );

-- ============================================================================
-- Webhooks
-- ============================================================================
CREATE TABLE webhook_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_space_id UUID REFERENCES spaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL CHECK (url ~ '^https?://'),
  secret TEXT NOT NULL, -- HMAC key; rotated by editing
  events TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhooks_active ON webhook_destinations(active) WHERE active;

CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID NOT NULL REFERENCES webhook_destinations(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  attempt INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'error')),
  response_code INT,
  response_body TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_deliveries_destination ON webhook_deliveries(destination_id, attempted_at DESC);

ALTER TABLE webhook_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Both: platform admins (managing platform-wide webhooks) + space admins
-- (managing webhooks scoped to their own space).
CREATE POLICY "wh_dest_admin" ON webhook_destinations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_platform_admin
    )
    OR (owner_space_id IS NOT NULL AND is_space_admin(owner_space_id))
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_platform_admin
    )
    OR (owner_space_id IS NOT NULL AND is_space_admin(owner_space_id))
  );

CREATE POLICY "wh_del_read" ON webhook_deliveries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_platform_admin
    )
    OR EXISTS (
      SELECT 1 FROM webhook_destinations d
      WHERE d.id = destination_id
        AND d.owner_space_id IS NOT NULL
        AND is_space_admin(d.owner_space_id)
    )
  );

-- ============================================================================
-- Platform config (key/value JSON)
-- ============================================================================
CREATE TABLE platform_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;
-- Read: any authenticated user (legal pages, branding)
CREATE POLICY "pc_read" ON platform_config
  FOR SELECT TO authenticated USING (true);
-- Write: platform admins only
CREATE POLICY "pc_admin_write" ON platform_config
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_platform_admin
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles WHERE user_id = auth.uid() AND is_platform_admin
    )
  );

-- Seed sane defaults so /privacy /terms have something to render.
INSERT INTO platform_config (key, value) VALUES
  ('legal.privacy', '"# Privacy policy\n\n_Replace this in /admin/legal/privacy._"'::jsonb),
  ('legal.terms',   '"# Terms of service\n\n_Replace this in /admin/legal/terms._"'::jsonb),
  ('branding',      '{"logo_url": null, "accent_color": null, "tagline": null}'::jsonb),
  ('defaults',      '{"timezone": "America/New_York", "density": "cozy", "theme": "dark"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- files.deleted_by — surface who soft-deleted a file in admin UIs
-- ============================================================================
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
