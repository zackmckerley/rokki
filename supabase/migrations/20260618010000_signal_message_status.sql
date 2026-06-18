-- Signal message delivery/read status.
--
-- Tracks the send lifecycle of outbound messages: sending → sent → delivered
-- (✓✓) → read, plus a terminal `failed`. The bridge captures the real
-- signal-cli send timestamp as `external_id`, then maps incoming
-- `receiptMessage` events (delivery/read) back to the row by that timestamp,
-- advancing status forward only. Inbound messages keep the default 'sent'
-- (the UI only renders status ticks on outbound bubbles).

BEGIN;

ALTER TABLE signal_messages
  ADD COLUMN status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sending', 'sent', 'delivered', 'read', 'failed')),
  ADD COLUMN status_at TIMESTAMPTZ;

-- Fast lookup of an outbound row by its signal timestamp during receipt handling.
CREATE INDEX signal_messages_out_ext_idx
  ON signal_messages (user_id, external_id)
  WHERE direction = 'out';

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- DROP INDEX IF EXISTS signal_messages_out_ext_idx;
-- ALTER TABLE signal_messages DROP COLUMN IF EXISTS status_at;
-- ALTER TABLE signal_messages DROP COLUMN IF EXISTS status;
-- COMMIT;
