#!/usr/bin/env bash
# P06-S1 / 30 — Secret Manager inventory + runtime SA grants.
# Some values can be generated safely here; the ones marked [PO] must be
# filled by the Product Owner (Google OAuth client, Gemini key, outbox sink).
# NOT RUN in the dev sandbox.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_gcloud

step "3.1 — auth secret (generated)"
ensure_secret "${SECRET_AUTH_SECRET}"
secret_add_version "${SECRET_AUTH_SECRET}" "$(random_hex 32)"

step "3.2 — abuse hash salt (generated)"
ensure_secret "${SECRET_ABUSE_HASH_SALT}"
secret_add_version "${SECRET_ABUSE_HASH_SALT}" "$(random_hex 16)"

step "3.3 — ADK service token (generated; SAME value goes to gon-web, gon-adk and gon-worker)"
ensure_secret "${SECRET_ADK_SERVICE_TOKEN}"
secret_add_version "${SECRET_ADK_SERVICE_TOKEN}" "gon-adk-$(random_hex 24)"

step "3.4 — Private Alpha invite code (generated; distribute manually)"
ensure_secret "${SECRET_INVITE_CODE}"
secret_add_version "${SECRET_INVITE_CODE}" "GON-$(random_hex 6 | tr '[:lower:]' '[:upper:]')"

step "3.5 — GCS signer private key (generated from the SA created in 10-storage.sh)"
ensure_secret "${SECRET_GCS_SIGNER_KEY}"
KEY_FILE="$(mktemp)"
trap 'rm -f "${KEY_FILE}"' EXIT
gcloud iam service-accounts keys create "${KEY_FILE}" --iam-account="${GCS_SIGNER_EMAIL}" >/dev/null
python3 - "${KEY_FILE}" <<'PY' | gcloud secrets versions add "${SECRET_GCS_SIGNER_KEY}" --data-file=-
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as handle:
    print(json.load(handle)["private_key"], end="")
PY
note "stored PEM private key of ${GCS_SIGNER_EMAIL}"
note "app env: GON_GCS_SERVICE_ACCOUNT_EMAIL=${GCS_SIGNER_EMAIL} + this key secret"

step "3.6 — [PO] Google OAuth client (Auth.js) — EMPTY until you fill them"
ensure_secret "${SECRET_GOOGLE_OAUTH_ID}"
ensure_secret "${SECRET_GOOGLE_OAUTH_SECRET}"
note "fill with:  printf '<client-id>'   | gcloud secrets versions add ${SECRET_GOOGLE_OAUTH_ID}"
note "            printf '<client-secret>' | gcloud secrets versions add ${SECRET_GOOGLE_OAUTH_SECRET}"
note "OAuth consent screen + client: console APIs & Services > Credentials;"
note "authorized redirect URI: ${GON_PUBLIC_ORIGIN}/api/auth/callback/google"

step "3.7 — [PO] Gemini API key — EMPTY until you fill it"
ensure_secret "${SECRET_GEMINI_API_KEY}"
note "fill with:  printf '<gemini-api-key>' | gcloud secrets versions add ${SECRET_GEMINI_API_KEY}"
note "used by BOTH gon-web (embeddings) and gon-adk (generation)"

step "3.8 — [PO] outbox sink receiver token — EMPTY until you fill it"
ensure_secret "${SECRET_OUTBOX_SINK_TOKEN}"
note "the outbox consumer (gon-worker) POSTs event batches to GON_OUTBOX_SINK_URL"
note "with this bearer token; fill the matching token your receiver expects:"
note "            printf '<sink-token>' | gcloud secrets versions add ${SECRET_OUTBOX_SINK_TOKEN}"

step "3.9 — grant the runtime SA read access to every secret"
for secret_name in \
  "${SECRET_DB_PASSWORD}" "${SECRET_DATABASE_URL}" "${SECRET_AUTH_SECRET}" \
  "${SECRET_GOOGLE_OAUTH_ID}" "${SECRET_GOOGLE_OAUTH_SECRET}" \
  "${SECRET_GEMINI_API_KEY}" "${SECRET_ADK_SERVICE_TOKEN}" \
  "${SECRET_ABUSE_HASH_SALT}" "${SECRET_INVITE_CODE}" \
  "${SECRET_GCS_SIGNER_KEY}" "${SECRET_OUTBOX_SINK_TOKEN}"; do
  grant_secret_reader "${RUN_SA_EMAIL}" "${secret_name}"
done

step "OK — fill every [PO] secret above, then run 40-deploy-adk.sh"
