-- Register the Contacts module in the global catalog.
--
-- The user-scope tab strip is driven by the in-process manifest registry
-- (apps/web/src/modules/index.ts), so Contacts shows up for users without
-- this row. But user_module_pins.slug and the marketplace both FK against
-- modules_catalog, so we seed the row to keep those paths consistent —
-- exactly as the Markets module did (20260616010000_markets_init.sql).
--
-- Contacts is owner-scoped (RLS owner_id = auth.uid()), so it's a user-only
-- module: no space/terminal install rows. enabled_by_default is moot for a
-- user-scope module (every "user"-scoped manifest renders regardless) and
-- left FALSE to match the opt-in convention.

BEGIN;

INSERT INTO modules_catalog (slug, name, description, icon, scopes, enabled_by_default) VALUES
  ('contacts', 'Contacts',
   'Your relationship layer — people, firms, contact details, and interaction history.',
   'contact', ARRAY['user'], FALSE)
ON CONFLICT (slug) DO NOTHING;

COMMIT;

-- ROLLBACK:
-- DELETE FROM modules_catalog WHERE slug = 'contacts';
