#!/usr/bin/env bash
# P06-S1 / 55 — deploy the Brew/outbox worker (gon-worker).
# B-P05-01 (worker + outbox sink). NOT RUN in the dev sandbox.
#
# Same image as gon-web; src/instrumentation.ts turns it into a worker via
# GON_WORKER_ENABLED=1 (Next.js instrumentation hook, battery-tested).
# Cloud Run specifics (decision D7):
#   --no-cpu-throttling + --min-instances 1: background loops need CPU outside
#   request processing; without this Cloud Run freezes the instance.
#   internal ingress: nothing public ever calls it; its HTTP port just satisfies
#   Cloud Run's process model while the worker loops run.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_gcloud

if [[ -z "${GON_OUTBOX_SINK_URL}" ]]; then
  echo "ERROR: GON_OUTBOX_SINK_URL is empty in gcp.env." >&2
  echo "The outbox consumer fails closed without a sink (createOutboxSinkFromEnv throws)," >&2
  echo "so the worker cannot start. Point it at any HTTPS receiver of the P03 outbox" >&2
  echo "batch contract (Pub/Sub push endpoint, a relay, or a receiver you operate)" >&2
  echo "and set the matching bearer token in ${SECRET_OUTBOX_SINK_TOKEN}." >&2
  exit 2
fi
if [[ -z "$(gcloud secrets versions list "${SECRET_OUTBOX_SINK_TOKEN}" --limit=1 --format='value(name)' 2>/dev/null)" ]]; then
  echo "ERROR: secret ${SECRET_OUTBOX_SINK_TOKEN} has no version — fill it first." >&2
  exit 2
fi

WEB_IMAGE="${AR_IMAGE_BASE}/gon-web:${DEPLOY_TAG}"

step "5.5 — deploy ${RUN_SERVICE_WORKER} (same image, worker mode)"
gcloud run deploy "${RUN_SERVICE_WORKER}" \
  --image "${WEB_IMAGE}" \
  --region "${GCP_REGION}" \
  --service-account "${RUN_SA_EMAIL}" \
  --no-allow-unauthenticated \
  --ingress internal-and-cloud-internal \
  --add-cloudsql-instances "${SQL_CONNECTION_NAME}" \
  --set-env-vars "\
GON_WORKER_ENABLED=1,\
GON_WORKER_CONCURRENCY=2,\
GON_STORE=postgres,\
GON_PUBLIC_ORIGIN=${GON_PUBLIC_ORIGIN},\
GON_TRUST_PROXY_HEADERS=1,\
GON_OBJECT_STORAGE=gcs,\
GON_GCS_BUCKET=${BUCKET_UPLOADS},\
GON_GCS_SERVICE_ACCOUNT_EMAIL=${GCS_SIGNER_EMAIL},\
GON_EMBEDDING_PROVIDER=gemini,\
GON_BREW_PROVIDER=adk,\
GON_ADK_BASE_URL=$(gcloud run services describe "${RUN_SERVICE_ADK}" --region "${GCP_REGION}" --format 'value(status.url)'),\
GON_ADK_TIMEOUT_MS=120000,\
GON_BREW_EXECUTION_MODE=${GON_BREW_EXECUTION_MODE_VALUE},\
GON_OUTBOX_SINK_URL=${GON_OUTBOX_SINK_URL}" \
  --set-secrets "\
DATABASE_URL=${SECRET_DATABASE_URL}:latest,\
GEMINI_API_KEY=${SECRET_GEMINI_API_KEY}:latest,\
GON_ADK_SERVICE_TOKEN=${SECRET_ADK_SERVICE_TOKEN}:latest,\
GON_GCS_SERVICE_ACCOUNT_PRIVATE_KEY=${SECRET_GCS_SIGNER_KEY}:latest,\
GON_ABUSE_HASH_SALT=${SECRET_ABUSE_HASH_SALT}:latest,\
GON_OUTBOX_SINK_TOKEN=${SECRET_OUTBOX_SINK_TOKEN}:latest" \
  --min-instances 1 --max-instances 3 \
  --cpu 1 --memory 1Gi \
  --no-cpu-throttling

step "5.6 — verify the worker actually started"
note "logs (look for the structured event worker_runtime_started):"
note "  gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=${RUN_SERVICE_WORKER}' --limit 20 --format 'value(textPayload)'"
note "a failed composition (missing secret/invalid sink URL) crashes the"
note "instance on boot and shows up here as repeated restarts + error events."
