-- The plpgsql task-ticker trigger body references `project_id`, which no
-- longer exists (renamed to `terminal_id`). PL/pgSQL resolves column names
-- lazily at call-time, so the rename only breaks when someone inserts a
-- task. Rewrite it to use the new column.
--
-- Also fix the add_terminal_creator_as_owner body: its INSERT still
-- references `project_id` since we copy-pasted from the original.

CREATE OR REPLACE FUNCTION set_task_ticker_seq()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.ticker_seq IS NULL OR NEW.ticker_seq = 0 THEN
    SELECT COALESCE(MAX(ticker_seq), 0) + 1 INTO NEW.ticker_seq
    FROM tasks WHERE terminal_id = NEW.terminal_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION add_terminal_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO terminal_members (terminal_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.created_by, 'owner', NEW.created_by);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
