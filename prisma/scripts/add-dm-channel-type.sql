-- Add DIRECT to chat.channel_type enum for DM 1:1 channels
ALTER TYPE chat.channel_type ADD VALUE IF NOT EXISTS 'DIRECT';

-- Create dm_participants table
CREATE TABLE IF NOT EXISTS chat.dm_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES chat.channels(id) ON DELETE CASCADE,
  admin_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_chat_dm_participant UNIQUE (channel_id, admin_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_dm_participants_admin ON chat.dm_participants (admin_id);
