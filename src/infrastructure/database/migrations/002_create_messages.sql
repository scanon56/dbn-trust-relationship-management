-- src/infrastructure/database/migrations/002_create_messages.sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Message identity
  message_id TEXT UNIQUE NOT NULL,
  thread_id TEXT,
  parent_id UUID REFERENCES messages(id),
  
  -- Connection context
  connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
  
  -- DIDComm envelope
  type TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_did TEXT NOT NULL,
  to_dids TEXT[] NOT NULL,
  
  -- Message content
  body JSONB NOT NULL,
  attachments JSONB DEFAULT '[]',
  
  -- Processing state
  state TEXT NOT NULL CHECK (state IN ('pending', 'sent', 'delivered', 'failed', 'processed')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  -- Full-text search
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', body::text)) STORED
);

CREATE INDEX idx_messages_message_id ON messages(message_id);
CREATE INDEX idx_messages_thread_id ON messages(thread_id);
CREATE INDEX idx_messages_connection_id ON messages(connection_id);
CREATE INDEX idx_messages_type ON messages(type);
CREATE INDEX idx_messages_direction ON messages(direction);
CREATE INDEX idx_messages_state ON messages(state);
CREATE INDEX idx_messages_from_did ON messages(from_did);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX idx_messages_search ON messages USING GIN(tsv);

COMMENT ON TABLE messages IS 'DIDComm messages sent and received';