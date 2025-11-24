# Database Helper Tools

A collection of tools to make working with the DBN Trust Relationship Management database easier.

## Files

- **db-helper.sh** - Interactive database helper script
- **common-queries.sql** - Collection of useful SQL queries

## Installation

1. Copy files to your project root:
```bash
cp db-helper.sh /path/to/dbn-trust-relationship-management/
cp common-queries.sql /path/to/dbn-trust-relationship-management/
```

2. Make the helper script executable:
```bash
chmod +x db-helper.sh
```

3. Ensure your `.env` file has database credentials:
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dbn_trust_management
DB_USER=postgres
DB_PASSWORD=postgres
```

## Quick Start

### Test database connection:
```bash
./db-helper.sh test
```

### Open interactive console:
```bash
./db-helper.sh console
```

### List all connections:
```bash
./db-helper.sh connections
```

### Show targeted invitations:
```bash
./db-helper.sh targeted
```

## All Commands

### Connection Commands
```bash
./db-helper.sh console          # Open psql console
./db-helper.sh test            # Test connection
./db-helper.sh info            # Show database info
```

### Query Commands
```bash
./db-helper.sh query "SQL"     # Custom SQL query
./db-helper.sh connections     # List all connections
./db-helper.sh invitations     # List invitations
./db-helper.sh messages        # List messages
./db-helper.sh recent          # Recent activity
```

### Inspection Commands
```bash
./db-helper.sh tables          # List all tables
./db-helper.sh describe TABLE  # Table structure
./db-helper.sh count TABLE     # Count rows
./db-helper.sh schema          # Full schema
```

### Targeted Invitation Commands
```bash
./db-helper.sh targeted        # Targeted invitations
./db-helper.sh open            # Open invitations
./db-helper.sh accepted        # Accepted connections
```

### Data Management
```bash
./db-helper.sh clear           # Clear all data
./db-helper.sh backup FILE     # Backup database
./db-helper.sh restore FILE    # Restore database
```

## Usage Examples

### Example 1: Check recent connections
```bash
./db-helper.sh connections
```

### Example 2: Find all targeted invitations
```bash
./db-helper.sh targeted
```

### Example 3: Custom query
```bash
./db-helper.sh query "SELECT * FROM connections WHERE state = 'complete'"
```

### Example 4: Inspect table structure
```bash
./db-helper.sh describe connections
```

### Example 5: Count messages
```bash
./db-helper.sh count messages
```

### Example 6: Backup database
```bash
./db-helper.sh backup my_backup.sql
```

### Example 7: Interactive mode
```bash
./db-helper.sh console

# Inside psql:
SELECT * FROM connections LIMIT 5;
\d connections
\q
```

## Testing Workflow After Creating Invitations

### 1. Create a targeted invitation via API
```bash
curl -X POST http://localhost:3001/api/v1/connections/invitations \
  -H "Content-Type: application/json" \
  -d '{
    "myDid": "did:web:example.com:alice",
    "targetDid": "did:web:example.com:bob",
    "goal": "Test targeted invitation"
  }'
```

### 2. Check it in database
```bash
./db-helper.sh targeted
```

### 3. View details
```bash
./db-helper.sh query "SELECT id, my_did, their_did, metadata FROM connections WHERE metadata->>'targetDid' = 'did:web:example.com:bob'"
```

### 4. Try to accept with wrong DID (should fail via API)
```bash
curl -X POST http://localhost:3001/api/v1/connections/accept-invitation \
  -H "Content-Type: application/json" \
  -d '{
    "invitation": "YOUR_INVITATION_URL",
    "myDid": "did:web:example.com:charlie"
  }'
```

### 5. Accept with correct DID (should succeed)
```bash
curl -X POST http://localhost:3001/api/v1/connections/accept-invitation \
  -H "Content-Type: application/json" \
  -d '{
    "invitation": "YOUR_INVITATION_URL",
    "myDid": "did:web:example.com:bob"
  }'
```

### 6. Verify acceptance
```bash
./db-helper.sh accepted
```

## Common Queries from common-queries.sql

You can run any query from `common-queries.sql`:

```bash
# Example: Find all targeted invitations
./db-helper.sh query "
SELECT 
    id,
    my_did,
    their_did as target_did,
    state,
    metadata->>'targetDid' as metadata_target,
    created_at
FROM connections
WHERE metadata->>'invitationType' = 'targeted'
ORDER BY created_at DESC;
"
```

## Troubleshooting

### "Permission denied" error
```bash
chmod +x db-helper.sh
```

### "psql: command not found"
```bash
# Install PostgreSQL
brew install postgresql@16

# Add to PATH
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### "Connection refused"
```bash
# Check if PostgreSQL is running
brew services list

# Start if needed
brew services start postgresql@16
```

### ".env file not found"
Make sure you have a `.env` file in your project root with:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=dbn_trust_management
DB_USER=postgres
DB_PASSWORD=postgres
```

## psql Quick Reference

Inside `./db-helper.sh console`:

```sql
-- List tables
\dt

-- Describe table
\d connections

-- Expanded display (better for wide tables)
\x

-- Show timing
\timing

-- Execute SQL file
\i common-queries.sql

-- Help
\?

-- Exit
\q
```

## Advanced Usage

### Create custom queries file
```bash
cat > my-queries.sql << 'EOF'
SELECT * FROM connections WHERE state = 'complete';
SELECT COUNT(*) FROM messages;
EOF

# Run it
./db-helper.sh console < my-queries.sql
```

### Pipe output to file
```bash
./db-helper.sh connections > connections.txt
```

### Use in scripts
```bash
#!/bin/bash
# Check if any connections exist
COUNT=$(./db-helper.sh query "SELECT COUNT(*) FROM connections;" | tail -1)
if [ "$COUNT" -gt 0 ]; then
    echo "Found $COUNT connections"
fi
```

## Tips

1. **Use tab completion** in psql console
2. **Press Ctrl+C** to cancel running query
3. **Use `\x`** for better formatting of wide tables
4. **Use `LIMIT`** when testing queries on large tables
5. **Backup before** running `clear` command

## Security Note

The helper script uses credentials from `.env`. Make sure:
- `.env` is in `.gitignore`
- Database credentials are secure
- Don't commit `db-helper.sh` with hardcoded passwords

## Support

For issues or questions about the database helper:
1. Check this README
2. Review `common-queries.sql` for query examples
3. Run `./db-helper.sh help`
