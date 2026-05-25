-- Terminals get a `slug` column derived from the name. The URL bar
-- on /p/<...> now reads the slug (e.g. "fairfield-river-debt") instead
-- of the Bloomberg-style ticker abbreviation ("FFRDBL"), matching how
-- spaces already work (/s/<slug>).
--
-- The `ticker` column stays so old shared URLs keep resolving — the
-- route handler tries `slug` first and falls back to `ticker`. We can
-- drop the column in a future cleanup once we're sure nobody is
-- relying on the old URLs.
--
-- Slug behavior:
--   - Set ONCE at INSERT time (sticky). Renaming a terminal does NOT
--     change its slug, so existing links never break. If the user
--     wants to change the slug they can edit it in settings later
--     (manual edit path is a follow-up; for now slug is read-only
--     after create).
--   - Unique per space, scoped to non-archived rows so a deleted
--     terminal's slug can be reused.
--   - On collision we append `-2`, `-3`, … until a unique value is
--     found, matching the way GitHub renames a fork.

-- ---------------------------------------------------------------------------
-- 1. Slugify helper (reusable from any trigger / view).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rokki_slugify(input TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  s TEXT;
BEGIN
  IF input IS NULL THEN RETURN 'untitled'; END IF;
  s := LOWER(input);
  -- Drop everything that isn't a lowercase letter or digit; collapse
  -- the resulting runs of separators into single hyphens.
  s := REGEXP_REPLACE(s, '[^a-z0-9]+', '-', 'g');
  -- Trim leading/trailing hyphens.
  s := REGEXP_REPLACE(s, '^-+|-+$', '', 'g');
  -- Cap length so the URL stays reasonable.
  s := SUBSTRING(s FROM 1 FOR 80);
  IF s IS NULL OR s = '' THEN s := 'untitled'; END IF;
  RETURN s;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Column + backfill.
-- ---------------------------------------------------------------------------

ALTER TABLE terminals ADD COLUMN slug TEXT;

-- Backfill with collision-suffix per space. RANK + the suffix logic
-- mirrors what the BEFORE INSERT trigger below will do for new rows,
-- so a terminal created today and a terminal backfilled today produce
-- the same slug shape.
WITH ranked AS (
  SELECT
    id,
    rokki_slugify(name) AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY space_id, rokki_slugify(name)
      ORDER BY created_at, id
    ) AS rn
  FROM terminals
)
UPDATE terminals t
SET slug = CASE
  WHEN ranked.rn = 1 THEN ranked.base_slug
  ELSE ranked.base_slug || '-' || (ranked.rn)::TEXT
END
FROM ranked
WHERE t.id = ranked.id;

ALTER TABLE terminals ALTER COLUMN slug SET NOT NULL;

-- Unique per space, only enforced while the terminal is live. An
-- archived terminal's slug is free to be reused by a new one.
CREATE UNIQUE INDEX terminals_space_id_slug_key
  ON terminals (space_id, slug)
  WHERE archived_at IS NULL;

-- Lookups by slug (no space scope yet — the route resolves by slug
-- across all terminals the caller can see, then RLS narrows it).
CREATE INDEX terminals_slug_idx ON terminals (slug) WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. BEFORE INSERT trigger — derive slug from name if the caller
--    didn't pass one. Sticky: never fires on UPDATE.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION terminals_default_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  n INT := 1;
BEGIN
  -- Caller may pass an explicit slug (e.g. settings rename path); only
  -- compute one if they didn't.
  IF NEW.slug IS NOT NULL AND NEW.slug <> '' THEN
    NEW.slug := rokki_slugify(NEW.slug);
    base_slug := NEW.slug;
  ELSE
    base_slug := rokki_slugify(NEW.name);
  END IF;

  candidate := base_slug;
  -- Walk -2, -3, … until we find an unused slug in this space.
  WHILE EXISTS (
    SELECT 1 FROM terminals
    WHERE space_id = NEW.space_id
      AND slug = candidate
      AND id <> NEW.id
      AND archived_at IS NULL
  ) LOOP
    n := n + 1;
    candidate := base_slug || '-' || n::TEXT;
  END LOOP;
  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_terminals_default_slug
  BEFORE INSERT ON terminals
  FOR EACH ROW
  EXECUTE FUNCTION terminals_default_slug();
