-- Fix: the rename migration copy-pasted the terminal creator trigger body
-- for the space creator trigger, inserting a non-existent `added_by`
-- column. space_members doesn't have that column (org_members never did).
-- Also ship the correct current_version/joined_at defaults.

CREATE OR REPLACE FUNCTION add_space_creator_as_owner()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO space_members (space_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
