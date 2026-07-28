-- Aditivo: autor del último mensaje (denormalizado para listados de canal).
ALTER TABLE chat.channels ADD COLUMN IF NOT EXISTS last_message_sender_name text;

-- Backfill desde el mensaje más reciente no borrado de cada canal.
UPDATE chat.channels c
SET last_message_sender_name = m.sender_name
FROM (
  SELECT DISTINCT ON (channel_id) channel_id, sender_name
  FROM chat.messages
  WHERE deleted_at IS NULL
  ORDER BY channel_id, created_at DESC
) m
WHERE m.channel_id = c.id AND c.last_message_sender_name IS NULL;
