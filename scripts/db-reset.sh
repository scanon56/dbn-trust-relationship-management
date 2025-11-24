#!/usr/bin/env bash
set -euo pipefail

# Resets database schema (drops and recreates public) then runs migrations.
# WARNING: This destroys all data.
# Usage: ./scripts/db-reset.sh

: "${DB_HOST:=localhost}"
: "${DB_PORT:=5432}"
: "${DB_NAME:=dbn_trust_management}"
: "${DB_USER:=postgres}"
: "${DB_PASSWORD:=postgres}" 

export PGPASSWORD="$DB_PASSWORD"

echo "[db-reset] Dropping and recreating schema public on $DB_NAME"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO "$DB_USER";
SQL

echo "[db-reset] Running TypeScript migrations via npm run migrate"
npm run migrate

echo "[db-reset] Done"
