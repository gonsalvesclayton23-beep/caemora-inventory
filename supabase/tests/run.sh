#!/usr/bin/env bash
# Spins up a throwaway Postgres, applies migrations + seed, runs SQL tests.
# Usage: bash supabase/tests/run.sh [--keep]   (--keep leaves the DB running on port 54329)
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
DATA=${TEST_PGDATA:-/tmp/caemora-pgtest}
PORT=${TEST_PGPORT:-54329}
if [ "$(id -u)" = 0 ]; then RUNAS="runuser -u postgres --"; chown_dir() { chown -R postgres "$1"; }; else RUNAS=""; chown_dir() { :; }; fi

if ! $RUNAS "$PGBIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
  rm -rf "$DATA"; mkdir -p "$DATA"; chown_dir "$DATA"
  $RUNAS "$PGBIN/initdb" -D "$DATA" -U postgres -A trust >/dev/null
  $RUNAS "$PGBIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/log" start >/dev/null
fi
PSQL="psql -h /tmp -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -d postgres -c "drop database if exists caemora_test" -c "create database caemora_test"
$PSQL -d caemora_test -f supabase/tests/auth_stub.sql
$PSQL -d caemora_test -f supabase/tests/grants.sql
for f in supabase/migrations/*.sql; do $PSQL -d caemora_test -f "$f"; done
$PSQL -d caemora_test -f supabase/seed.sql
$PSQL -d caemora_test -f supabase/tests/tests.sql >/dev/null
$PSQL -d caemora_test -f supabase/tests/pur06.sql >/dev/null
$PSQL -d caemora_test -f supabase/tests/ui04.sql >/dev/null
echo "All database tests passed."
if [ "${1:-}" != "--keep" ]; then $RUNAS "$PGBIN/pg_ctl" -D "$DATA" stop >/dev/null; fi
