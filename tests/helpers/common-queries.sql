-- Common SQL Queries for DBN Trust Relationship Management
-- Run these queries using: ./db-helper.sh query "QUERY_HERE"

-- ============================================
-- CONNECTION QUERIES
-- ============================================

-- List all connections with full details
SELECT 
    id,
    my_did,
    their_did,
    their_label,
    state,
    role,
    their_endpoint,
    invitation,
    invitation_url,
    metadata,
    created_at,
    updated_at
FROM connections
ORDER BY created_at DESC;

-- Find connections by state
SELECT * FROM connections WHERE state = 'active';
SELECT * FROM connections WHERE state = 'invited';

-- Find connection by DID pair
SELECT * FROM connections 
WHERE my_did = 'did:web:example.com:alice' 
  AND their_did = 'did:web:example.com:bob';

-- Count connections by state
SELECT 
    state,
    COUNT(*) as count
FROM connections
GROUP BY state
ORDER BY count DESC;

-- ============================================
-- TARGETED INVITATION QUERIES
-- ============================================

-- Show all targeted invitations
SELECT 
    id,
    my_did,
    their_did as target_did,
    state,
    metadata->>'targetDid' as metadata_target,
    metadata->>'goal' as goal,
    invitation->>'@id' as invitation_id,
    created_at
FROM connections
WHERE metadata->>'invitationType' = 'targeted'
ORDER BY created_at DESC;

-- Show open invitations (no target)
SELECT 
    id,
    my_did,
    state,
    metadata->>'goal' as goal,
    invitation_url,
    created_at
FROM connections
WHERE metadata->>'invitationType' = 'open'
  AND state = 'invited'
ORDER BY created_at DESC;

-- Find who accepted targeted invitations
SELECT 
    c1.id as invitation_id,
    c1.my_did as inviter_did,
    c1.their_did as target_did,
    c1.created_at as invitation_created,
    c2.id as accepted_connection_id,
    c2.my_did as acceptor_did,
    c2.state as acceptor_state,
    c2.created_at as accepted_at,
    c2.metadata->>'wasTargeted' as was_targeted
FROM connections c1
LEFT JOIN connections c2 
    ON c1.invitation->>'@id' = c2.metadata->>'invitationId'
WHERE c1.state = 'invited' 
  AND c1.metadata->>'invitationType' = 'targeted';

-- ============================================
-- MESSAGE QUERIES
-- ============================================

-- List all messages with details
SELECT 
    id,
    message_id,
    thread_id,
    type,
    direction,
    from_did,
    to_dids,
    state,
    body,
    created_at,
    processed_at
FROM messages
ORDER BY created_at DESC
LIMIT 50;

-- Find messages by connection
SELECT * FROM messages 
WHERE connection_id = 'YOUR_CONNECTION_ID_HERE'
ORDER BY created_at DESC;

-- Find messages by thread
SELECT * FROM messages 
WHERE thread_id = 'YOUR_THREAD_ID_HERE'
ORDER BY created_at ASC;

-- Count messages by type
SELECT 
    type,
    COUNT(*) as count
FROM messages
GROUP BY type
ORDER BY count DESC;

-- Count messages by state
SELECT 
    state,
    direction,
    COUNT(*) as count
FROM messages
GROUP BY state, direction
ORDER BY state, direction;

-- Find failed messages
SELECT 
    id,
    message_id,
    type,
    state,
    error_message,
    retry_count,
    created_at
FROM messages
WHERE state = 'failed'
ORDER BY created_at DESC;

-- Search messages by content (full-text search)
SELECT 
    id,
    type,
    direction,
    body->>'content' as content,
    created_at
FROM messages
WHERE tsv @@ to_tsquery('english', 'YOUR_SEARCH_TERM')
ORDER BY created_at DESC;

-- ============================================
-- PROTOCOL CAPABILITY QUERIES
-- ============================================

-- List all discovered capabilities
SELECT 
    did,
    protocol_id,
    enabled,
    discovered_at,
    last_verified_at,
    metadata
FROM protocol_capabilities
ORDER BY discovered_at DESC;

-- Find capabilities for a specific DID
SELECT * FROM protocol_capabilities 
WHERE did = 'did:web:example.com:bob';

-- Count protocols by DID
SELECT 
    did,
    COUNT(*) as protocol_count
FROM protocol_capabilities
WHERE enabled = true
GROUP BY did
ORDER BY protocol_count DESC;

-- Find DIDs supporting specific protocol
SELECT DISTINCT did 
FROM protocol_capabilities
WHERE protocol_id = 'https://didcomm.org/basicmessage/2.0'
  AND enabled = true;

-- ============================================
-- ANALYTICS QUERIES
-- ============================================

-- Connection success rate
SELECT 
    COUNT(CASE WHEN state = 'active' THEN 1 END) as active_count,
    COUNT(CASE WHEN state = 'invited' THEN 1 END) as pending_count,
    COUNT(CASE WHEN state = 'error' THEN 1 END) as error_count,
    COUNT(*) as total_count,
    ROUND(100.0 * COUNT(CASE WHEN state = 'active' THEN 1 END) / COUNT(*), 2) as success_rate
FROM connections;

-- Message delivery stats
SELECT 
    COUNT(CASE WHEN state = 'delivered' THEN 1 END) as delivered,
    COUNT(CASE WHEN state = 'sent' THEN 1 END) as sent,
    COUNT(CASE WHEN state = 'failed' THEN 1 END) as failed,
    COUNT(CASE WHEN state = 'pending' THEN 1 END) as pending,
    COUNT(*) as total,
    ROUND(100.0 * COUNT(CASE WHEN state = 'delivered' THEN 1 END) / COUNT(*), 2) as delivery_rate
FROM messages;

-- Activity by hour (last 24 hours)
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as connection_count
FROM connections
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Most active DIDs
SELECT 
    my_did,
    COUNT(*) as connection_count,
    COUNT(CASE WHEN state = 'active' THEN 1 END) as active_connections
FROM connections
GROUP BY my_did
ORDER BY connection_count DESC
LIMIT 10;

-- Average message processing time
SELECT 
    AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_seconds,
    MIN(EXTRACT(EPOCH FROM (processed_at - created_at))) as min_processing_seconds,
    MAX(EXTRACT(EPOCH FROM (processed_at - created_at))) as max_processing_seconds
FROM messages
WHERE processed_at IS NOT NULL;

-- ============================================
-- DEBUGGING QUERIES
-- ============================================

-- Find orphaned messages (no connection)
SELECT * FROM messages 
WHERE connection_id IS NOT NULL
  AND connection_id NOT IN (SELECT id FROM connections);

-- Find connections with invalid state
SELECT * FROM connections 
WHERE state NOT IN ('invited', 'requested', 'responded', 'active', 'completed', 'error');

-- Check for duplicate connections
SELECT 
    my_did, 
    their_did, 
    COUNT(*) as duplicate_count
FROM connections
GROUP BY my_did, their_did
HAVING COUNT(*) > 1;

-- Find stale invitations (older than 7 days, not accepted)
SELECT 
    id,
    my_did,
    their_did,
    created_at,
    AGE(NOW(), created_at) as age
FROM connections
WHERE state = 'invited'
  AND created_at < NOW() - INTERVAL '7 days'
ORDER BY created_at;

-- ============================================
-- MAINTENANCE QUERIES
-- ============================================

-- Database size
SELECT 
    pg_size_pretty(pg_database_size(current_database())) as database_size;

-- Table sizes
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index usage statistics
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan as index_scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Find missing indexes (sequential scans on large tables)
SELECT 
    schemaname,
    tablename,
    seq_scan as sequential_scans,
    seq_tup_read as rows_read,
    idx_scan as index_scans,
    n_live_tup as estimated_rows
FROM pg_stat_user_tables
WHERE seq_scan > 0
  AND n_live_tup > 1000
ORDER BY seq_tup_read DESC;

-- ============================================
-- JSONB QUERIES (Metadata & Body)
-- ============================================

-- Extract specific metadata fields
SELECT 
    id,
    my_did,
    metadata->>'invitationType' as invitation_type,
    metadata->>'targetDid' as target_did,
    metadata->>'goal' as goal,
    metadata->>'wasTargeted' as was_targeted
FROM connections
WHERE metadata IS NOT NULL;

-- Find connections with specific metadata value
SELECT * FROM connections
WHERE metadata @> '{"invitationType": "targeted"}';

-- Find messages with specific body content
SELECT * FROM messages
WHERE body @> '{"content": "Hello"}';

-- Extract all keys from metadata
SELECT DISTINCT jsonb_object_keys(metadata) as metadata_keys
FROM connections
WHERE metadata IS NOT NULL;

-- Pretty print JSON
SELECT 
    id,
    jsonb_pretty(metadata) as metadata,
    jsonb_pretty(invitation) as invitation
FROM connections
WHERE id = 'YOUR_CONNECTION_ID_HERE';

-- ============================================
-- EXPORT QUERIES
-- ============================================

-- Export connections as CSV
COPY (
    SELECT 
        id,
        my_did,
        their_did,
        state,
        created_at
    FROM connections
) TO '/tmp/connections_export.csv' WITH CSV HEADER;

-- Export messages as CSV
COPY (
    SELECT 
        id,
        type,
        direction,
        state,
        created_at
    FROM messages
) TO '/tmp/messages_export.csv' WITH CSV HEADER;