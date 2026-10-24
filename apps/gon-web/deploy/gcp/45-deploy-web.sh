#!/usr/bin/env bash
# P06-S1 / 45 — build + deploy gon-web (Cloud Run) via the unix-socket
# Cloud SQL connection. B-P05-01/02/06 wiring. NOT RUN in the dev sandbox.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_gcloud

WEB_APP_DIR="$(cd "${GCP_DIR}/../.." && pwd)"
ADK_URL="$(gcloud run services describe "${RUN_SERVICE_ADK}" --region "${GCP_REGION}" --format 'value(status.url)' 2>/dev/null || true)"
if [[ -z "${ADK_URL}" ]]; then
  echo "ERROR: ${RUN_SERVICE_ADK} not deployed yet — run 40-deploy-adk.sh first." >&2
  exit 2
fi

step "4.5 — sanity: every secret referenced below has a version"
for secret_name in \
  "${SECRET_DATABASE_URL}" "${SECRET_AUTH_SECRET}" \
  "${SECRET_GOOGLE_OAUTH_ID}" "${SECRET_GOOGLE_OAUTH_SECRET}" \
  "${SECRET_GEMINI_API_KEY}" "${SECRET_ADK_SERVICE_TOKEN}" \
  "${SECRET_ABUSE_HASH_SALT}" "${SECRET_INVITE_CODE}" \
  "${SECRET_GCS_SIGNER_KEY}"; do
  if [[ -z "$(gcloud secrets versions list "${secret_name}" --limit=1 --format='value(name)' 2>/dev/null)" ]]; then
    echo "ERROR: secret ${secret_name} has no version — fill it first (30-secrets.sh prints how)." >&2
    exit 2
  fi
done

step "4.6 — build image (Cloud Build, same Dockerfile as the worker/migrate job)"
gcloud builds submit "${WEB_APP_DIR}" \
  --tag "${AR_IMAGE_BASE}/gon-web:${DEPLOY_TAG}"

step "4.7 — deploy ${RUN_SERVICE_WEB}"
# Env split: non-secret wiring here, secret material via Secret Manager.
gcloud run deploy "${RUN_SERVICE_WEB}" \
  --image "${AR_IMAGE_BASE}/gon-web:${DEPLOY_TAG}" \
  --region "${GCP_REGION}" \
  --service-account "${RUN_SA_EMAIL}" \
  --allow-unauthenticated \
  --add-cloudsql-instances "${SQL_CONNECTION_NAME}" \
  --set-env-vars "\
GON_STORE=postgres,\
GON_PUBLIC_ORIGIN=${GON_PUBLIC_ORIGIN},\
GON_TRUST_PROXY_HEADERS=1,\
AUTH_TRUST_HOST=true,\
GON_OBJECT_STORAGE=gcs,\
GON_GCS_BUCKET=${BUCKET_UPLOADS},\
GON_GCS_SERVICE_ACCOUNT_EMAIL=${GCS_SIGNER_EMAIL},\
GON_EMBEDDING_PROVIDER=gemini,\
GON_BREW_PROVIDER=adk,\
GON_ADK_BASE_URL=${ADK_URL},\
GON_ADK_TIMEOUT_MS=120000,\
GON_BREW_EXECUTION_MODE=${GON_BREW_EXECUTION_MODE_VALUE}" \
  --set-secrets "\
DATABASE_URL=${SECRET_DATABASE_URL}:latest,\
AUTH_SECRET=${SECRET_AUTH_SECRET}:latest,\
AUTH_GOOGLE_ID=${SECRET_GOOGLE_OAUTH_ID}:latest,\
AUTH_GOOGLE_SECRET=${SECRET_GOOGLE_OAUTH_SECRET}:latest,\
GEMINI_API_KEY=${SECRET_GEMINI_API_KEY}:latest,\
GON_ADK_SERVICE_TOKEN=${SECRET_ADK_SERVICE_TOKEN}:latest,\
GON_GCS_SERVICE_ACCOUNT_PRIVATE_KEY=${SECRET_GCS_SIGNER_KEY}:latest,\
GON_ABUSE_HASH_SALT=${SECRET_ABUSE_HASH_SALT}:latest,\
GON_DEV_INVITE_CODE=${SECRET_INVITE_CODE}:latest" \
  --min-instances 1 --max-instances 10 \
  --concurrency 40 --cpu 1 --memory 1Gi --timeout 180s \
  --startup-cpu-boost

WEB_URL="$(gcloud run services describe "${RUN_SERVICE_WEB}" --region "${GCP_REGION}" --format 'value(status.url)')"
note "${RUN_SERVICE_WEB}: ${WEB_URL}"
note "health:   curl ${WEB_URL}/healthz"
note "readiness (migrations + DB + storage must all be green): curl ${WEB_URL}/readyz"
note "public traffic goes through the LB (60-edge.sh); the run.app URL stays"
note "reachable in staging — restrict with --ingress after DNS/cert are live."
