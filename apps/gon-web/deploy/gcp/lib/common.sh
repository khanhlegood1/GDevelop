#!/usr/bin/env bash
# Shared helpers for the GON GCP deploy scripts (P06-S1).
# Sourced by the numbered scripts after gcp.env; not executable standalone.

GCP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=../gcp.env
# shellcheck source=/dev/null
if [[ ! -f "${GCP_DIR}/gcp.env" ]]; then
  echo "ERROR: ${GCP_DIR}/gcp.env not found. Copy gcp.env.example and edit it first." >&2
  exit 2
fi
# shellcheck disable=SC1091
source "${GCP_DIR}/gcp.env"

SQL_CONNECTION_NAME="${GCP_PROJECT_ID}:${GCP_REGION}:${SQL_INSTANCE}"
AR_IMAGE_BASE="${GCP_AR_LOCATION}-docker.pkg.dev/${GCP_PROJECT_ID}/${GCP_AR_REPO}"
RUN_SA_EMAIL="${RUN_SERVICE_ACCOUNT}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"
GCS_SIGNER_EMAIL="${GCS_SIGNER_ACCOUNT}@${GCP_PROJECT_ID}.iam.gserviceaccount.com"

step() { printf '\n== %s ==\n' "$*"; }
note() { printf '   %s\n' "$*"; }

require_gcloud() {
  command -v gcloud >/dev/null 2>&1 || { echo "ERROR: gcloud CLI not installed." >&2; exit 2; }
  if [[ -z "$(gcloud config get-value account 2>/dev/null)" ]]; then
    echo "ERROR: no active gcloud account. Run: gcloud auth login" >&2
    exit 2
  fi
  gcloud config set project "${GCP_PROJECT_ID}" >/dev/null
}

# ensure_secret NAME — create if missing (no value yet).
ensure_secret() {
  local name="$1"
  if gcloud secrets describe "${name}" >/dev/null 2>&1; then
    note "secret ${name}: exists"
  else
    gcloud secrets create "${name}" --replication-policy="automatic" >/dev/null
    note "secret ${name}: created (empty)"
  fi
}

# secret_add_version NAME [VALUE_OR_FLAG] — VALUE_OR_FLAG may start with '-'
# to be passed verbatim to gcloud (e.g. --data-file=-).
secret_add_version() {
  local name="$1" value="$2"
  if [[ "${value}" == -* ]]; then
    gcloud secrets versions add "${name}" ${value} >/dev/null
  else
    printf '%s' "${value}" | gcloud secrets versions add "${name}" --data-file=- >/dev/null
  fi
  note "secret ${name}: new version stored"
}

# grant_secret_reader EMAIL NAME — least-privilege accessor grant.
grant_secret_reader() {
  local email="$1" name="$2"
  gcloud secrets add-iam-policy-binding "${name}" \
    --member="serviceAccount:${email}" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None >/dev/null
  note "secret ${name}: reader ${email}"
}

# random_hex BYTES
random_hex() { openssl rand -hex "${1:-16}"; }

# ensure_api service — enable if not already.
ensure_api() {
  local service="$1"
  gcloud services enable "${service}" >/dev/null
  note "api ${service}: enabled"
}
