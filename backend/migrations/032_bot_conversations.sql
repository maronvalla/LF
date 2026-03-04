CREATE TABLE IF NOT EXISTS bot_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'IDLE',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel, chat_id)
);

CREATE INDEX IF NOT EXISTS bot_conversations_channel_updated_idx
  ON bot_conversations(channel, updated_at DESC);
