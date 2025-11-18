-- src/infrastructure/database/migrations/003_create_protocol_capabilities.sql
CREATE TABLE protocol_capabilities (
  did TEXT NOT NULL,
  protocol_id TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  last_verified_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  
  PRIMARY KEY (did, protocol_id)
);

CREATE INDEX idx_protocol_capabilities_did ON protocol_capabilities(did);
CREATE INDEX idx_protocol_capabilities_protocol_id ON protocol_capabilities(protocol_id);
CREATE INDEX idx_protocol_capabilities_enabled ON protocol_capabilities(enabled);

COMMENT ON TABLE protocol_capabilities IS 'Cache of protocol capabilities discovered from peer DIDs';