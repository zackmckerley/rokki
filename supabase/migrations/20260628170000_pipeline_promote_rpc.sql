-- Atomic promote-to-Terminal.
--
-- Replaces the app's four un-transacted writes with one SECURITY DEFINER
-- function so the whole promote is atomic (no orphan terminal on partial
-- failure), races can't double-promote (FOR UPDATE lock + promoted-guard), and
-- ALL of the lead's linked contacts carry onto the terminal — even ones linked
-- by a co-member, which the caller's owner-scoped RLS would otherwise drop.
--
-- The caller supplies a pre-validated, space-unique ticker (ticker generation
-- stays in app code, where it's tested). The function re-checks authorization
-- (caller must be a member of the lead's space — definer bypasses RLS, so this
-- is explicit), the ticker shape, and the not-already-promoted invariant.

BEGIN;

CREATE OR REPLACE FUNCTION promote_lead_to_terminal(p_lead_id uuid, p_ticker text)
RETURNS TABLE (terminal_id uuid, out_ticker text, out_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead pl_leads%ROWTYPE;
  v_term_id uuid;
BEGIN
  -- Lock the lead so two concurrent promotes can't both pass the guard.
  SELECT * INTO v_lead FROM pl_leads WHERE id = p_lead_id FOR UPDATE;
  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  -- Re-authorize: caller must belong to the lead's space (definer bypasses RLS).
  IF NOT EXISTS (
    SELECT 1 FROM space_members
     WHERE space_id = v_lead.space_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not a member of this space';
  END IF;

  IF v_lead.promoted_terminal_id IS NOT NULL THEN
    RAISE EXCEPTION 'This lead is already a terminal';
  END IF;

  IF p_ticker !~ '^[A-Z][A-Z0-9]{1,9}$' THEN
    RAISE EXCEPTION 'Invalid ticker';
  END IF;

  -- Create the terminal (trg_terminal_init_members fires here, seeding the
  -- caller + space owners as terminal members).
  INSERT INTO terminals (space_id, ticker, name, type, status, created_by)
  VALUES (v_lead.space_id, p_ticker, v_lead.name, 'deal', 'active', auth.uid())
  RETURNING id INTO v_term_id;

  -- Carry EVERY linked contact onto the terminal (definer → not owner-scoped).
  INSERT INTO terminal_contacts (terminal_id, contact_id, role)
  SELECT v_term_id, lc.contact_id, lc.role
    FROM pl_lead_contacts lc
   WHERE lc.lead_id = p_lead_id
  ON CONFLICT (terminal_id, contact_id) DO NOTHING;

  UPDATE pl_leads
     SET promoted_terminal_id = v_term_id, status = 'converted', updated_at = now()
   WHERE id = p_lead_id;

  RETURN QUERY SELECT v_term_id, p_ticker, v_lead.name;
END;
$$;

GRANT EXECUTE ON FUNCTION promote_lead_to_terminal(uuid, text) TO authenticated;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP FUNCTION IF EXISTS promote_lead_to_terminal(uuid, text);
-- COMMIT;
