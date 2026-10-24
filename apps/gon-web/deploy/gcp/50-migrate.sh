#!/usr/bin/env bash
# P06-S1 / 50 — schema migrations as Cloud Run Jobs (same image as gon-web).
# B-P05-01 (managed PostgreSQL migration path). NOT RUN in the dev sandbox.
#
# Order matters: migrate THEN check. The check (scripts/check-migrations.mjs,
# the same tool the CI/local battery uses) fails if db/migrations and
# gon_schema_migrations disagree — checksum drift included.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_gcloud

WEB_IMAGE="${AR_IMAGE_BASE}/gon-web:${DEPLOY_TAG}"
SECRET_ARGS="--set-secrets=DATABASE_URL=${SECRET_DATABASE_URL}:latest"

step "5.1 — job gon-migrate (node scripts/migrate.mjs)"
if gcloud run jobs describe gon-migrate --region "${GCP_REGION}" >/dev/null 2>&1; then
  gcloud run jobs update gon-migrate \
    --region "${GCP_REGION}" \
    --image "${WEB_IMAGE}" \
    --command node --args "scripts/migrate.mjs" \
    --service-account "${RUN_SA_EMAIL}" \
    --add-cloudsql-instances "${SQL_CONNECTION_NAME}" \
    --set-env-vars "NODE_ENV=production" \
    ${SECRET_ARGS} >/dev/null
else
  gcloud run jobs create gon-migrate \
    --region "${GCP_REGION}" \
    --image "${WEB_IMAGE}" \
    --command node --args "scripts/migrate.mjs" \
    --service-account "${RUN_SA_EMAIL}" \
    --add-cloudsql-instances "${SQL_CONNECTION_NAME}" \
    --set-env-vars "NODE_ENV=production" \
    ${SECRET_ARGS} >/dev/null
fi

step "5.2 — execute gon-migrate"
gcloud run jobs execute gon-migrate --region "${GCP_REGION}" --wait

step "5.3 — job gon-dbcheck (node scripts/check-migrations.mjs)"
if gcloud run jobs describe gon-dbcheck --region "${GCP_REGION}" >/dev/null 2>&1; then
  gcloud run jobs update gon-dbcheck \
    --region "${GCP_REGION}" \
    --image "${WEB_IMAGE}" \
    --command node --args "scripts/check-migrations.mjs" \
    --service-account "${RUN_SA_EMAIL}" \
    --add-cloudsql-instances "${SQL_CONNECTION_NAME}" \
    --set-env-vars "NODE_ENV=production" \
    ${SECRET_ARGS} >/dev/null
else
  gcloud run jobs create gon-dbcheck \
    --region "${GCP_REGION}" \
    --image "${WEB_IMAGE}" \
    --command node --args "scripts/check-migrations.mjs" \
    --service-account "${RUN_SA_EMAIL}" \
    --add-cloudsql-instances "${SQL_CONNECTION_NAME}" \
    --set-env-vars "NODE_ENV=production" \
    ${SECRET_ARGS} >/dev/null
fi

step "5.4 — execute gon-dbcheck"
gcloud run jobs execute gon-dbcheck --region "${GCP_REGION}" --wait

step "OK — schema is at the battery-verified state; run 55-worker.sh next"
