#!/usr/bin/env bash
# PostgreSQL restore — GON DR tooling (P05-R1.11)
# STATUS: NOT RUN in the development sandbox. Destructive: restores INTO the
# target database with --clean --if-exists. Always restore into a scratch
# database first (verify-backup.sh), never straight into production.
#
# Usage:
#   DATABASE_URL=postgres://.../gon_scratch ./restore-postgres.sh backups/gon-<stamp>.dump
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required (point it at a NON-production scratch database)" >&2
  exit 1
fi

DUMP="${1:?usage: restore-postgres.sh <dump-file>}"
if [[ ! -f "$DUMP" ]]; then
  echo "dump not found: $DUMP" >&2
  exit 1
fi

if [[ -f "$DUMP.sha256" ]]; then
  echo "Checking checksum..."
  ( cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256" )
fi

echo "Restoring $DUMP into the target database (clean)..."
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$DUMP"

echo "Restore finished. Run verify-backup.sh before promoting the database."
