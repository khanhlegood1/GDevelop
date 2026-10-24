#!/usr/bin/env bash
# P06-S1 / 00 — prerequisites: tooling, auth, APIs, billing.
# NOT RUN in the dev sandbox; execute on the machine that deploys GON.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_gcloud

step "0.1 — gcloud version"
gcloud --version | head -1

step "0.2 — active account / project"
gcloud config get-value account
gcloud config get-value project

step "0.3 — billing (required for Cloud Run/SQL/Armor)"
if [[ -z "${BILLING_ACCOUNT_ID}" ]]; then
  echo "   NOTE: BILLING_ACCOUNT_ID is empty in gcp.env — set it before 70-observability.sh"
  echo "   (list available accounts with: gcloud billing accounts list)"
fi

step "0.4 — enable APIs"
ensure_api run.googleapis.com
ensure_api cloudbuild.googleapis.com
ensure_api artifactregistry.googleapis.com
ensure_api sqladmin.googleapis.com
ensure_api secretmanager.googleapis.com
ensure_api compute.googleapis.com
ensure_api monitoring.googleapis.com
ensure_api logging.googleapis.com
ensure_api billingbudgets.googleapis.com

step "OK — run 10-storage.sh next"
