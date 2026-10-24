#!/usr/bin/env bash
# P06-S1 / 40 — build + deploy the GON ADK contract service (Cloud Run).
# B-P05-03 (real Gemini/ADK endpoint). NOT RUN in the dev sandbox.
#
# Exposure model (decision D5): --allow-unauthenticated at the Cloud Run layer
# is REQUIRED because gon-web authenticates with the static service token
# (HttpAdkBrewAiProvider), not a Google ID token. Isolation comes from
# --ingress internal-and-cloud-internal (no public internet path) PLUS the
# app's own fail-closed token check (GON_ADK_ENV=staging rejects requests
# without a valid bearer token).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_gcloud

ADK_APP_DIR="$(cd "${GCP_DIR}/../../../gon-adk" && pwd)"
CONTRACTS_DIR="${GCP_DIR}/../../docs/04-contracts"

step "4.0 — sanity: secrets the ADK service needs"
for secret_name in "${SECRET_ADK_SERVICE_TOKEN}" "${SECRET_GEMINI_API_KEY}"; do
  if [[ -z "$(gcloud secrets versions list "${secret_name}" --limit=1 --format='value(name)' 2>/dev/null)" ]]; then
    echo "ERROR: secret ${secret_name} has no version. Fill it first (30-secrets.sh prints how)." >&2
    exit 2
  fi
done

step "4.1 — stage the LOCKED P03 contracts into the build context"
rm -rf "${ADK_APP_DIR}/docs-contracts"
cp -R "${CONTRACTS_DIR}" "${ADK_APP_DIR}/docs-contracts"
note "staged $(find "${ADK_APP_DIR}/docs-contracts" -name '*.json' | wc -l | tr -d ' ') contract files (git-ignored, build-time copy only)"

step "4.2 — Artifact Registry repo"
if gcloud artifacts repositories describe "${GCP_AR_REPO}" --location="${GCP_AR_LOCATION}" >/dev/null 2>&1; then
  note "${AR_IMAGE_BASE}: exists"
else
  gcloud artifacts repositories create "${GCP_AR_REPO}" \
    --repository-format="docker" --location="${GCP_AR_LOCATION}" >/dev/null
fi

step "4.3 — build image (Cloud Build)"
gcloud builds submit "${ADK_APP_DIR}" \
  --tag "${AR_IMAGE_BASE}/gon-adk:${DEPLOY_TAG}"

step "4.4 — deploy ${RUN_SERVICE_ADK} (internal ingress, token-gated)"
gcloud run deploy "${RUN_SERVICE_ADK}" \
  --image "${AR_IMAGE_BASE}/gon-adk:${DEPLOY_TAG}" \
  --region "${GCP_REGION}" \
  --service-account "${RUN_SA_EMAIL}" \
  --allow-unauthenticated \
  --ingress internal-and-cloud-internal \
  --set-env-vars "GON_ADK_ENV=${GON_ADK_ENV_VALUE},GON_ADK_PROVIDER=google,GON_CONTRACTS_DIR=/app/contracts" \
  --set-secrets "GON_ADK_SERVICE_TOKEN=${SECRET_ADK_SERVICE_TOKEN}:latest,GOOGLE_API_KEY=${SECRET_GEMINI_API_KEY}:latest" \
  --min-instances 0 --max-instances 4 \
  --concurrency 4 --cpu 1 --memory 1Gi --timeout 300s

ADK_URL="$(gcloud run services describe "${RUN_SERVICE_ADK}" --region "${GCP_REGION}" --format 'value(status.url)')"
note "${RUN_SERVICE_ADK}: ${ADK_URL}"
note "next: 45-deploy-web.sh wires GON_ADK_BASE_URL=${ADK_URL} into gon-web"
