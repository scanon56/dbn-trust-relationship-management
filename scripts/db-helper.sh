#!/bin/bash

# Database Helper Script for DBN Trust Relationship Management
# Usage: ./db-helper.sh [command] [args]

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Determine project root (one level up from this script)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Load environment variables from project .env file (if present)
ENV_FILE="${PROJECT_ROOT}/.env"
if [ -f "${ENV_FILE}" ]; then
    # Export variables in .env safely (supports simple KEY=VALUE lines)
    set -a
    # shellcheck disable=SC1090
    . "${ENV_FILE}"
    set +a
else
    echo -e "${YELLOW}⚠${NC} .env not found at ${ENV_FILE} — using defaults"
fi

# Provide sane defaults if any DB_* vars are missing
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-dbn_trust_management}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}

# Ensure psql is available for DB commands
if ! command -v psql >/dev/null 2>&1; then
    echo -e "${RED}Error:${NC} 'psql' is not installed or not on PATH"
    echo "Install PostgreSQL client tools (e.g., 'brew install libpq && brew link --force libpq' on macOS)."
    exit 1
fi

# Database connection string
DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}"

# Function to print colored output
print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Function to execute SQL query
execute_query() {
    PGPASSWORD="${DB_PASSWORD}" psql -X -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" "$@"
}

# Function to execute SQL with nice formatting
execute_formatted() {
    PGPASSWORD="${DB_PASSWORD}" psql -X -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -x -c "$1"
}

# Show help
show_help() {
    cat << EOF
${GREEN}Database Helper Script${NC}
Usage: ./db-helper.sh [command]

${YELLOW}Connection Commands:${NC}
  console, psql       Open interactive psql console
  test               Test database connection
  info               Show database information

${YELLOW}Query Commands:${NC}
  query "SQL"        Execute custom SQL query
  connections        List all connections
  invitations        List all invitations
  messages           List all messages
  recent             Show recent activity

${YELLOW}Inspection Commands:${NC}
  tables             List all tables
  describe TABLE     Describe table structure
  count TABLE        Count rows in table
  schema             Show complete database schema

${YELLOW}Targeted Invitation Commands:${NC}
  targeted           Show all targeted invitations
  open               Show all open invitations
  accepted           Show accepted connections

${YELLOW}Data Management:${NC}
  clear              Clear all data (DANGEROUS!)
  backup FILE        Backup database to file
  restore FILE       Restore database from file

${YELLOW}Examples:${NC}
  ./db-helper.sh console
  ./db-helper.sh connections
  ./db-helper.sh query "SELECT * FROM connections WHERE state = 'active'"
  ./db-helper.sh describe connections
  ./db-helper.sh targeted

EOF
}

# Test database connection
test_connection() {
    print_info "Testing database connection..."
    if execute_query -c "SELECT 1" > /dev/null 2>&1; then
        print_success "Database connection successful"
        execute_query -c "SELECT version();"
    else
        print_error "Database connection failed"
        exit 1
    fi
}

# Show database info
show_info() {
    print_info "Database Information"
    execute_query << EOF
SELECT 
    'Database' as info, 
    current_database() as value
UNION ALL
SELECT 
    'User',
    current_user
UNION ALL
SELECT 
    'Host',
    inet_server_addr()::text
UNION ALL
SELECT 
    'Port',
    inet_server_port()::text
UNION ALL
SELECT
    'Version',
    version();
EOF
}

# List all tables
list_tables() {
    print_info "Tables in database"
    execute_query << EOF
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY schemaname, tablename;
EOF
}

# Describe table structure
describe_table() {
    if [ -z "$1" ]; then
        print_error "Please specify a table name"
        echo "Usage: ./db-helper.sh describe TABLE_NAME"
        exit 1
    fi
    
    print_info "Structure of table: $1"
    execute_query << EOF
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = '$1'
ORDER BY ordinal_position;
EOF

    print_info "Indexes on table: $1"
    execute_query << EOF
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = '$1';
EOF
}

# Count rows in table
count_rows() {
    if [ -z "$1" ]; then
        print_error "Please specify a table name"
        exit 1
    fi
    
    print_info "Row count for table: $1"
    execute_query -c "SELECT COUNT(*) as row_count FROM $1;"
}

# Show complete schema
show_schema() {
    print_info "Complete Database Schema"
    execute_query -c "\d+"
}

# List all connections
list_connections() {
    print_info "All Connections"
    execute_query << EOF
SELECT 
    id,
    my_did,
    their_did,
    state,
    role,
    metadata->>'invitationType' as type,
    their_endpoint,
    their_protocols,
    their_services,
    created_at
FROM connections
ORDER BY created_at DESC;
EOF
}

# List all invitations
list_invitations() {
    print_info "All Invitations (state = 'invited')"
    execute_query << EOF
SELECT 
    id,
    my_did,
    their_did,
    role,
    state,
    metadata->>'invitationType' as invitation_type,
    metadata->>'targetDid' as target_did,
    created_at
FROM connections
WHERE state = 'invited'
ORDER BY created_at DESC;
EOF
}

# List all messages
list_messages() {
    print_info "All Messages"
    execute_query << EOF
SELECT 
    id,
    type,
    direction,
    from_did,
    state,
    created_at
FROM messages
ORDER BY created_at DESC
LIMIT 20;
EOF
}

# Show recent activity
show_recent() {
    print_info "Recent Activity (Last 10 connections and messages)"
    
    echo ""
    print_info "Recent Connections:"
    execute_query << EOF
SELECT 
    id,
    my_did,
    their_did,
    state,
    created_at
FROM connections
ORDER BY created_at DESC
LIMIT 10;
EOF

    echo ""
    print_info "Recent Messages:"
    execute_query << EOF
SELECT 
    id,
    type,
    direction,
    state,
    created_at
FROM messages
ORDER BY created_at DESC
LIMIT 10;
EOF
}

# Show targeted invitations
show_targeted() {
    print_info "Targeted Invitations"
    execute_query << EOF
SELECT 
    id,
    my_did,
    their_did,
    state,
    metadata->>'targetDid' as target_did,
    metadata->>'goal' as goal,
    created_at
FROM connections
WHERE metadata->>'invitationType' = 'targeted'
ORDER BY created_at DESC;
EOF
}

# Show open invitations
show_open() {
    print_info "Open Invitations"
    execute_query << EOF
SELECT 
    id,
    my_did,
    state,
    metadata->>'goal' as goal,
    created_at
FROM connections
WHERE metadata->>'invitationType' = 'open'
ORDER BY created_at DESC;
EOF
}

# Show accepted connections
show_accepted() {
    print_info "Accepted Connections"
    execute_query << EOF
SELECT 
    id,
    my_did,
    their_did,
    state,
    metadata->>'wasTargeted' as was_targeted,
    metadata->>'invitationId' as invitation_id,
    created_at
FROM connections
WHERE state IN ('requested', 'responded', 'active')
ORDER BY created_at DESC;
EOF
}

# Clear all data
clear_data() {
    print_warning "This will delete ALL data from the database!"
    read -p "Are you sure? Type 'yes' to confirm: " confirm
    
    if [ "$confirm" = "yes" ]; then
        print_info "Clearing all data..."
        execute_query << EOF
TRUNCATE TABLE messages, connections, protocol_capabilities CASCADE;
EOF
        print_success "All data cleared"
    else
        print_info "Operation cancelled"
    fi
}

# Backup database
backup_db() {
    if [ -z "$1" ]; then
        BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
    else
        BACKUP_FILE="$1"
    fi
    
    print_info "Backing up database to: $BACKUP_FILE"
    PGPASSWORD=$DB_PASSWORD pg_dump -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$BACKUP_FILE"
    print_success "Backup completed: $BACKUP_FILE"
}

# Restore database
restore_db() {
    if [ -z "$1" ]; then
        print_error "Please specify backup file"
        echo "Usage: ./db-helper.sh restore FILE"
        exit 1
    fi
    
    if [ ! -f "$1" ]; then
        print_error "Backup file not found: $1"
        exit 1
    fi
    
    print_warning "This will restore the database from: $1"
    read -p "Continue? Type 'yes' to confirm: " confirm
    
    if [ "$confirm" = "yes" ]; then
        print_info "Restoring database..."
        PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f "$1"
        print_success "Database restored"
    else
        print_info "Operation cancelled"
    fi
}

# Execute custom query
execute_custom_query() {
    if [ -z "$1" ]; then
        print_error "Please provide a SQL query"
        echo "Usage: ./db-helper.sh query \"SELECT * FROM connections\""
        exit 1
    fi
    
    print_info "Executing query..."
    execute_query -c "$1"
}

# Open psql console
open_console() {
    print_info "Opening PostgreSQL console..."
    print_info "Type \\q to exit"
    execute_query
}

# Main command dispatcher
case "${1:-help}" in
    help|--help|-h)
        show_help
        ;;
    console|psql)
        open_console
        ;;
    test)
        test_connection
        ;;
    info)
        show_info
        ;;
    tables)
        list_tables
        ;;
    describe|desc)
        describe_table "$2"
        ;;
    count)
        count_rows "$2"
        ;;
    schema)
        show_schema
        ;;
    connections)
        list_connections
        ;;
    invitations)
        list_invitations
        ;;
    messages)
        list_messages
        ;;
    recent)
        show_recent
        ;;
    targeted)
        show_targeted
        ;;
    open)
        show_open
        ;;
    accepted)
        show_accepted
        ;;
    query)
        execute_custom_query "$2"
        ;;
    clear)
        clear_data
        ;;
    backup)
        backup_db "$2"
        ;;
    restore)
        restore_db "$2"
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac