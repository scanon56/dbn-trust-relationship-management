-- 004_alter_connections_state.sql
-- Update connections.state check constraint to Aries-compliant states
ALTER TABLE connections DROP CONSTRAINT IF EXISTS connections_state_check;
ALTER TABLE connections ADD CONSTRAINT connections_state_check CHECK (state IN ('invited','requested','responded','complete','error'));
-- Normalize any legacy rows still using 'active' or 'completed'
UPDATE connections SET state='complete' WHERE state IN ('active','completed');