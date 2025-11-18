-- src/infrastructure/database/migrations/001_create_connections.sql
CREATE TABLE connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Connection identities
  my_did TEXT NOT NULL,
  their_did TEXT NOT NULL,
  their_label TEXT,
  
  -- Connection state
  state TEXT NOT NULL CHECK (state IN ('invited', 'requested', 'responded', 'active', 'completed', 'error')),
  role TEXT NOT NULL CHECK (role IN ('inviter', 'invitee')),
  
  -- Their capabilities
  their_endpoint TEXT,
  their_protocols JSONB DEFAULT '[]',
  their_services JSONB DEFAULT '[]',
  
  -- Out-of-band invitation
  invitation JSONB,
  invitation_url TEXT,
  
  -- Relationship metadata
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_active_at TIMESTAMPTZ,
  
  -- Constraints
  UNIQUE(my_did, their_did)
);

CREATE INDEX idx_connections_my_did ON connections(my_did);
CREATE INDEX idx_connections_their_did ON connections(their_did);
CREATE INDEX idx_connections_state ON connections(state);
CREATE INDEX idx_connections_protocols ON connections USING GIN(their_protocols);
CREATE INDEX idx_connections_tags ON connections USING GIN(tags);
CREATE INDEX idx_connections_created_at ON connections(created_at DESC);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_connections_updated_at 
  BEFORE UPDATE ON connections 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE connections IS 'DIDComm peer connections and their metadata';