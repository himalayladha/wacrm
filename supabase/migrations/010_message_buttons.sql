-- ============================================================
-- Message buttons (migration 010)
--
-- Adds a JSONB column so outbound WhatsApp interactive reply buttons
-- can be rendered in the inbox after the message is sent.
-- ============================================================

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS buttons JSONB;
