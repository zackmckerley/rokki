-- Lets a pipeline opt out of template field-sync once the user edits its fields.
--
-- ensurePipelineForSpace keeps a template-backed pipeline's `fields` in sync with
-- its template (so new template fields appear on an already-created pipeline).
-- Once the user adds/removes/edits fields via the field editor, that sync must
-- stop clobbering their changes — this flag is how it knows.

BEGIN;

ALTER TABLE pl_pipelines
  ADD COLUMN fields_customized BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- ALTER TABLE pl_pipelines DROP COLUMN fields_customized;
-- COMMIT;
