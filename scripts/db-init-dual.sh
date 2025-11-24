#!/usr/bin/env bash
set -euo pipefail

# Initialize two separate databases for dual-agent testing.
# Usage: ./scripts/db-init-dual.sh [DB_HOST] [DB_PORT]
# Defaults: localhost 5432

DB_HOST=${1:-${DB_HOST:-localhost}}
DB_PORT=${2:-${DB_PORT:-5432}}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}
DB_NAME_A=${DB_NAME_A:-dbn_trust_management_a}
DB_NAME_B=${DB_NAME_B:-dbn_trust_management_b}

export PGPASSWORD="$DB_PASSWORD"

create_db() {
  local name="$1"
  echo "[dual-init] Ensuring database '$name' exists on $DB_HOST:$DB_PORT"
  if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -lqt | cut -d '|' -f 1 | grep -qw "$name"; then
    echo "[dual-init] Database '$name' already exists"
  else
    createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$name"
    echo "[dual-init] Created database '$name'"
  fi
}

migrate_db() {
  local name="$1"
  echo "[dual-init] Running migrations for '$name'"
  DB_NAME="$name" npm run migrate >/dev/null
  echo "[dual-init] Migrations complete for '$name'"
}

create_db "$DB_NAME_A"
create_db "$DB_NAME_B"

migrate_db "$DB_NAME_A"
migrate_db "$DB_NAME_B"

echo "[dual-init] Done. Use: \n  PORT=3001 DB_NAME=$DB_NAME_A DIDCOMM_ENDPOINT=http://localhost:3001/didcomm npm run dev \n  PORT=3002 DB_NAME=$DB_NAME_B DIDCOMM_ENDPOINT=http://localhost:3002/didcomm npm run dev"
