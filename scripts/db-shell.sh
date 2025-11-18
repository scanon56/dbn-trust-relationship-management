#!/usr/bin/env bash
set -euo pipefail

# Opens a psql shell using current environment variables.
# Usage: ./scripts/db-shell.sh

: "${DB_HOST:=localhost}"
: "${DB_PORT:=5432}"
: "${DB_NAME:=dbn_platform}"
: "${DB_USER:=dbn_user}"
: "${DB_PASSWORD:=dbn_password}" # For convenience; consider using a safer secret manager.

export PGPASSWORD="$DB_PASSWORD"

echo "Connecting to $DB_HOST:$DB_PORT db=$DB_NAME user=$DB_USER"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" "$@"
