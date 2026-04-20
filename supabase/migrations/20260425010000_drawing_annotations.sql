-- Drawing annotations: pin a short note to a point on a page of a PDF.
--
-- Any file whose mime_type is application/pdf is eligible — no separate
-- "drawing" type needed. Annotations respect the file's RLS (can_see_file).

CREATE TABLE drawing_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  page_number INT NOT NULL CHECK (page_number >= 1),
  -- Normalized coordinates 0..1 so the annotation stays pinned across
  -- zoom + viewport sizes.
  x_pct DOUBLE PRECISION NOT NULL CHECK (x_pct >= 0 AND x_pct <= 1),
  y_pct DOUBLE PRECISION NOT NULL CHECK (y_pct >= 0 AND y_pct <= 1),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  color TEXT NOT NULL DEFAULT 'accent' CHECK (
    color IN ('accent', 'success', 'warning', 'danger')
  ),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_drawing_annotations_file_page
  ON drawing_annotations(file_id, page_number)
  WHERE deleted_at IS NULL;

ALTER TABLE drawing_annotations ENABLE ROW LEVEL SECURITY;

-- Select: anyone who can see the parent file.
CREATE POLICY "drawing_annotations_select" ON drawing_annotations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM files f
      WHERE f.id = drawing_annotations.file_id
        AND can_see_file(f)
    )
  );

-- Insert: any member of the file's terminal.
CREATE POLICY "drawing_annotations_insert" ON drawing_annotations
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM files f
      WHERE f.id = drawing_annotations.file_id
        AND is_terminal_member(f.terminal_id)
    )
  );

-- Update (mark resolved, edit body): author or terminal manager.
CREATE POLICY "drawing_annotations_update" ON drawing_annotations
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM files f
      WHERE f.id = drawing_annotations.file_id
        AND is_terminal_manager(f.terminal_id)
    )
  );

-- Delete (soft): author or terminal manager.
CREATE POLICY "drawing_annotations_delete" ON drawing_annotations
  FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM files f
      WHERE f.id = drawing_annotations.file_id
        AND is_terminal_manager(f.terminal_id)
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE drawing_annotations;
