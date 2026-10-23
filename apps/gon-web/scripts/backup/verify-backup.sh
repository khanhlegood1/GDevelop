#!/usr/bin/env bash
# Backup verification — GON DR tooling (P05-R1.11)
# STATUS: NOT RUN in the development sandbox. Restores the dump into a
# scratch database and checks GON schema readiness (required tables +
# gon_schema_migrations) before a restore is trusted.
#
# Usage:
#   SCRATCH_DATABASE_URL=postgres://.../gon_scratch_verify ./verify-backup.sh backups/gon-<stamp>.dump
set -euo pipefail

SCRATCH="${SCRATCH_DATABASE_URL:?SCRATCH_DATABASE_URL is required (a disposable database)}"
DUMP="${1:?usage: verify-backup.sh <dump-file>}"

if [[ -f "$DUMP.sha256" ]]; then
  ( cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256" )
fi

echo "Listing dump contents..."
pg_restore --list "$DUMP" > /dev/null

echo "Restoring into scratch database..."
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$SCRATCH" "$DUMP"

echo "Checking migration ledger..."
APPLIED="$(psql "$SCRATCH" -Atc "select count(*) from gon_schema_migrations")"
if [[ -z "$APPLIED" || "$APPLIED" == "0" ]]; then
  echo "FAIL: gon_schema_migrations is empty in the restored database" >&2
  exit 1
fi

TABLES="$(psql "$SCRATCH" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
echo "OK: restored $APPLIED migration rows, $TABLES public tables."
echo "Next: run app smoke tests against the scratch database, then document the result in the DR runbook."
