#!/usr/bin/env bash
# P06-S1 / 10 — private object storage: uploads + exports buckets.
# B-P05-01 (storage) / B-P05-05 (export retention).
# NOT RUN in the dev sandbox.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_gcloud

step "1.0 — GCS signer service account (signs upload URLs with its key)"
if gcloud iam service-accounts describe "${GCS_SIGNER_EMAIL}" >/dev/null 2>&1; then
  note "${GCS_SIGNER_EMAIL}: exists"
else
  gcloud iam service-accounts create "${GCS_SIGNER_ACCOUNT}" \
    --display-name="GON GCS URL signer (staging)" >/dev/null
  note "${GCS_SIGNER_EMAIL}: created"
fi

step "1.1 — uploads bucket (private, uniform access, versioned)"
if gsutil ls -b "gs://${BUCKET_UPLOADS}" >/dev/null 2>&1; then
  note "gs://${BUCKET_UPLOADS}: exists"
else
  gsutil mb -l "${GCP_REGION}" -b on "gs://${BUCKET_UPLOADS}"
fi
gsutil versioning set on "gs://${BUCKET_UPLOADS}"
# Signed-URL direct uploads from the browser need this CORS shape and nothing wider.
cat > /tmp/gon-cors.json <<EOF
[
  {
    "origin": ["${GON_PUBLIC_ORIGIN}"],
    "method": ["PUT", "POST"],
    "responseHeader": ["content-type"],
    "maxAgeSeconds": 600
  }
]
EOF
gsutil cors set /tmp/gon-cors.json "gs://${BUCKET_UPLOADS}"
rm -f /tmp/gon-cors.json
# Lifecycle: drop old object versions (30d) and abandoned multipart uploads (7d).
cat > /tmp/gon-life-uploads.json <<'EOF'
{
  "rule": [
    { "action": { "type": "Delete" }, "condition": { "isLive": false, "age": 30 } },
    { "action": { "type": "AbortIncompleteMultipartUpload" }, "condition": { "age": 7 } }
  ]
}
EOF
gsutil lifecycle set /tmp/gon-life-uploads.json "gs://${BUCKET_UPLOADS}"
rm -f /tmp/gon-life-uploads.json
# Private by default: no public access, no authenticated read.
gsutil defstorageclass set STANDARD "gs://${BUCKET_UPLOADS}" >/dev/null

step "1.2 — exports bucket (backup/DR copies + user data exports, 30d retention)"
if gsutil ls -b "gs://${BUCKET_EXPORTS}" >/dev/null 2>&1; then
  note "gs://${BUCKET_EXPORTS}: exists"
else
  gsutil mb -l "${GCP_REGION}" -b on "gs://${BUCKET_EXPORTS}"
fi
cat > /tmp/gon-life-exports.json <<'EOF'
{
  "rule": [
    { "action": { "type": "Delete" }, "condition": { "age": 30 } },
    { "action": { "type": "AbortIncompleteMultipartUpload" }, "condition": { "age": 1 } }
  ]
}
EOF
gsutil lifecycle set /tmp/gon-life-exports.json "gs://${BUCKET_EXPORTS}"
rm -f /tmp/gon-life-exports.json

step "1.3 — signer SA may read uploads (signed URLs) and write exports"
gsutil iam ch "serviceAccount:${GCS_SIGNER_EMAIL}:objectViewer" "gs://${BUCKET_UPLOADS}"
gsutil iam ch "serviceAccount:${GCS_SIGNER_EMAIL}:objectAdmin" "gs://${BUCKET_EXPORTS}"

step "OK — run 20-database.sh next"
