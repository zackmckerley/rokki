-- Human-facing revision label for files. Works alongside the existing
-- `version` int + `supersedes` chain; this is what users see on a sheet
-- stamp ("A", "B", "2024-04-30", "Rev. 3") rather than the internal
-- version counter.
--
-- For non-drawing files it stays null and has no effect. We picked a
-- short VARCHAR so this doesn't balloon pg_dump size.

ALTER TABLE files
  ADD COLUMN IF NOT EXISTS revision_label VARCHAR(40);

COMMENT ON COLUMN files.revision_label IS
  'User-facing revision stamp (e.g. "A", "Rev 3"). Independent of `version` counter.';
