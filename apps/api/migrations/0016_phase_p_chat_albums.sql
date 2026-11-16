-- Keep multi-photo/video messages in a deliberately chosen album across sessions.
ALTER TABLE chat_messages ADD COLUMN media_group_id TEXT;
CREATE INDEX IF NOT EXISTS idx_chat_media_group ON chat_messages(booking_id,media_group_id,created_at)
  WHERE media_group_id IS NOT NULL;
