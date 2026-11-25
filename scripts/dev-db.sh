#!/usr/bin/env bash
# Rebuilds a local dev database (caemora_dev) from the migrations and loads MIT-2026.xlsx into it.
# Needs the test Postgres running: bash supabase/tests/run.sh --keep
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${TEST_PGPORT:-54329}
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "drop database if exists caemora_dev" -c "create database caemora_dev"
for f in supabase/tests/auth_stub.sql supabase/tests/grants.sql supabase/migrations/*.sql supabase/seed.sql; do $PSQL -d caemora_dev -f "$f"; done
DATABASE_URL="postgres://postgres@localhost:$PORT/caemora_dev?host=/tmp" npx tsx scripts/import/run.ts --load
