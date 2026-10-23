#!/usr/bin/env bash
# PostgreSQL backup — GON DR tooling (P05-R1.11)
# STATUS: NOT RUN in the development sandbox (needs a managed PostgreSQL
# endpoint + pg_dump matching the server major version). Runbook:
# docs/06-nfr/P05-R1.11-OBSERVABILITY-BACKUP-DR.md.
#
# Usage:
#   DATABASE_URL=postgres://... ./backup-postgres.sh [output-dir]
#
# Produces a custom-format dump + sha256 sidecar. Custom format enables
# pg_restore --clean/--if-exists and selective table restores.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

OUT_DIR="${1:-${GON_BACKUP_DIR:-./backups}}"
mkdir -p "$OUT_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/gon-${STAMP}.dump"

echo "Backing up to $FILE (custom format)..."
pg_dump --format=custom --no-owner --no-privileges --file="$FILE" "$DATABASE_URL"

( cd "$OUT_DIR" && sha256sum "$(basename "$FILE")" > "$(basename "$FILE").sha256" )

echo "Verifying dump integrity (pg_restore --list)..."
pg_restore --list "$FILE" > /dev/null

echo "OK: $FILE + $FILE.sha256"
echo "Retention: keep at least the last 7 daily + 4 weekly copies (adjust to RPO)."
