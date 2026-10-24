#!/usr/bin/env bash
# P06-S1 / 80 — backup/restore DRILL (B-P05-07: RPO <= 24h, RTO <= 4h).
# NOT RUN in the dev sandbox. This script is DESTRUCTIVE-BY-COST only: it
# creates a clone instance (billable for its lifetime) and expects you to
# delete it afterwards. It never touches the primary instance.
#
# Usage:  CONFIRM_DRILL=yes ./80-restore-drill.sh [point-in-time UTC, default now-30m]
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_gcloud

if [[ "${CONFIRM_DRILL:-}" != "yes" ]]; then
  echo "Refusing to run without CONFIRM_DRILL=yes (this creates a billable clone)." >&2
  echo "Read this script first; the drill procedure is documented in" >&2
  echo "docs/07-deployment/P06-S1-CLOUD-DEPLOYMENT-PACKAGE.md (D9)." >&2
  exit 2
fi

DRILL_INSTANCE="${SQL_INSTANCE}-drill"
PIT="${1:-$(date -u -d '30 minutes ago' +%Y-%m-%dT%H:%M:%SZ)}"
DRILL_START="$(date -u +%s)"

step "8.1 — record drill start (UTC): $(date -u)"
note "restore point requested: ${PIT} (RPO target: worst case 24h — PITR gives minutes)"

step "8.2 — clone the instance at the restore point (does NOT touch ${SQL_INSTANCE})"
gcloud sql instances clone "${SQL_INSTANCE}" "${DRILL_INSTANCE}" --point-in-time="${PIT}"

step "8.3 — wait for the clone to become RUNNABLE (RTO clock is running)"
while :; do
  STATE="$(gcloud sql instances describe "${DRILL_INSTANCE}" --format 'value(state)')"
  [[ "${STATE}" == "RUNNABLE" ]] && break
  note "state: ${STATE} ..."
  sleep 30
done
DRILL_END="$(date -u +%s)"
note "clone RUNNABLE after $(( (DRILL_END - DRILL_START) / 60 )) min $(( (DRILL_END - DRILL_START) % 60 )) s"

step "8.4 — verification checklist (PO runs these from an authorized machine)"
cat <<EOF
   1. Users/sessions survive:
        gcloud sql connect ${DRILL_INSTANCE} --database=${SQL_DB} --user=postgres \\
          --execute="select count(*) from users; select count(*) from sessions;"
   2. Domain data + outbox present:
        --execute="select count(*) from gon_users; select count(*) from projects;
                   select count(*) from outbox_events where created_at > '${PIT}';"
   3. Abuse/quota state (flood boxes, quota reservations):
        --execute="select count(*) from abuse_state; select count(*) from quota_reservations;"
   4. Record RTO/RPO numbers in the Go-Live checklist before deleting the clone.
EOF

step "8.5 — cleanup (run when the checklist is recorded)"
echo "   gcloud sql instances delete ${DRILL_INSTANCE}"
echo "   (deletion protection is OFF on clones; the primary keeps its own guard)"
