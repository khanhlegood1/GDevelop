#!/usr/bin/env bash
# P06-S1 / 20 — Cloud SQL for PostgreSQL 17 (pgvector) + runtime SA.
# B-P05-01 (managed PostgreSQL). NOT RUN in the dev sandbox.
#
# Connection shape: Cloud Run's built-in Cloud SQL connection (unix socket
# /cloudsql/<instance>) — no VPC connector needed, always TLS to the instance.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_gcloud

step "2.0 — runtime service account (web/adk/worker share it; least-privilege grants follow)"
if gcloud iam service-accounts describe "${RUN_SA_EMAIL}" >/dev/null 2>&1; then
  note "${RUN_SA_EMAIL}: exists"
else
  gcloud iam service-accounts create "${RUN_SERVICE_ACCOUNT}" \
    --display-name="GON Cloud Run runtime (staging)" >/dev/null
  note "${RUN_SA_EMAIL}: created"
fi
gcloud projects add-iam-policy-binding "${GCP_PROJECT_ID}" \
  --member="serviceAccount:${RUN_SA_EMAIL}" \
  --role="roles/cloudsql.client" \
  --condition=None >/dev/null
note "granted roles/cloudsql.client (instance connection only)"

step "2.1 — Cloud SQL PostgreSQL instance"
if gcloud sql instances describe "${SQL_INSTANCE}" >/dev/null 2>&1; then
  note "${SQL_INSTANCE}: exists"
else
  gcloud sql instances create "${SQL_INSTANCE}" \
    --database-version="POSTGRES_${SQL_PG_VERSION}" \
    --edition="enterprise" \
    --tier="${SQL_TIER}" \
    --region="${GCP_REGION}" \
    --availability-type="REGIONAL" \
    --storage-auto-increase \
    --backup-start-time="${SQL_BACKUP_HOUR}:00" \
    --enable-point-in-time-recovery \
    --retained-transaction-log-days=7 \
    --deletion-protection \
    --assign-ip
  note "created (daily backups + 7d PITR + deletion protection)"
  note "public IP with NO authorized networks: direct TCP is closed; only the"
  note "Cloud Run built-in Cloud SQL connector (IAM) and SQL Admin API reach it."
fi

step "2.2 — database + user"
if gcloud sql databases describe "${SQL_DB}" --instance="${SQL_INSTANCE}" >/dev/null 2>&1; then
  note "database ${SQL_DB}: exists"
else
  gcloud sql databases create "${SQL_DB}" --instance="${SQL_INSTANCE}"
fi

step "2.3 — application password -> Secret Manager (printed once)"
ensure_secret "${SECRET_DB_PASSWORD}"
if [[ -z "$(gcloud secrets versions list "${SECRET_DB_PASSWORD}" --limit=1 --format='value(name)' 2>/dev/null)" ]]; then
  DB_PASSWORD="$(random_hex 24)"
  secret_add_version "${SECRET_DB_PASSWORD}" "${DB_PASSWORD}"
  echo "   DB password for ${SQL_USER}: ${DB_PASSWORD}"
  echo "   (record it now; it is only retrievable via 'gcloud secrets versions access')"
else
  DB_PASSWORD="$(gcloud secrets versions access latest --secret="${SECRET_DB_PASSWORD}")"
  note "using existing ${SECRET_DB_PASSWORD} version"
fi

# Cloud SQL users are idempotent-unfriendly: create only when absent.
if gcloud sql users list --instance="${SQL_INSTANCE}" --format='value(name)' | grep -qx "${SQL_USER}"; then
  note "user ${SQL_USER}: exists (password untouched)"
else
  gcloud sql users create "${SQL_USER}" \
    --instance="${SQL_INSTANCE}" \
    --password="${DB_PASSWORD}"
fi

step "2.4 — DATABASE_URL secret (unix socket form for Cloud Run)"
ensure_secret "${SECRET_DATABASE_URL}"
DATABASE_URL_VALUE="postgres://${SQL_USER}:$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1],safe=""))' "${DB_PASSWORD}")@/${SQL_DB}?host=/cloudsql/${SQL_CONNECTION_NAME}"
secret_add_version "${SECRET_DATABASE_URL}" "${DATABASE_URL_VALUE}"
note "postgres://${SQL_USER}:***@/${SQL_DB}?host=/cloudsql/${SQL_CONNECTION_NAME}"

step "OK — run 30-secrets.sh next (PO fills OAuth/Gemini/GCS-key values)"
