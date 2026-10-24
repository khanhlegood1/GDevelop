#!/usr/bin/env bash
# P06-S1 / 60 — public edge: HTTPS LB + Cloud Armor + managed cert.
# B-P05-06 (edge rate limiting) / domain wiring. NOT RUN in the dev sandbox.
#
# Reuses the packaged policy from deploy/edge-rate-limit/cloud-armor-policy.yaml
# (P05-R1.10): per-IP 30 req/10s ban on /v1 + 120 req/min sustained cap.
# GON_TRUST_PROXY_HEADERS=1 is already set on gon-web (45-deploy-web.sh).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_gcloud

ARMOR_POLICY_FILE="${GCP_DIR}/../edge-rate-limit/cloud-armor-policy.yaml"

step "6.0 — import Cloud Armor policy"
if gcloud compute security-policies describe gon-edge-rate-limit >/dev/null 2>&1; then
  gcloud compute security-policies import gon-edge-rate-limit \
    --source="${ARMOR_POLICY_FILE}" --force >/dev/null
  note "gon-edge-rate-limit: updated from packaged yaml"
else
  gcloud compute security-policies import gon-edge-rate-limit \
    --source="${ARMOR_POLICY_FILE}" >/dev/null
  note "gon-edge-rate-limit: imported"
fi

step "6.1 — reserve the global IPv4 address"
if gcloud compute addresses describe gon-lb-ip --global >/dev/null 2>&1; then
  note "gon-lb-ip: exists"
else
  gcloud compute addresses create gon-lb-ip --global --ip-version=IPV4
fi
LB_IP="$(gcloud compute addresses describe gon-lb-ip --global --format 'value(address)')"

step "6.2 — serverless NEG -> ${RUN_SERVICE_WEB}"
if gcloud compute network-endpoint-groups describe gon-web-neg --region "${GCP_REGION}" >/dev/null 2>&1; then
  note "gon-web-neg: exists"
else
  gcloud compute network-endpoint-groups create gon-web-neg \
    --region "${GCP_REGION}" \
    --network-endpoint-type="serverless" \
    --cloud-run-service="${RUN_SERVICE_WEB}"
fi

step "6.3 — backend service with the security policy attached"
if gcloud compute backend-services describe gon-web-backend --global >/dev/null 2>&1; then
  note "gon-web-backend: exists"
else
  gcloud compute backend-services create gon-web-backend \
    --global \
    --load-balancing-scheme="EXTERNAL_MANAGED" \
    --protocol="HTTPS" 2>/dev/null || \
  gcloud compute backend-services create gon-web-backend --global
  gcloud compute backend-services add-backend gon-web-backend \
    --global \
    --network-endpoint-group="gon-web-neg" \
    --network-endpoint-group-region="${GCP_REGION}"
fi
gcloud compute backend-services update gon-web-backend \
  --global --security-policy="gon-edge-rate-limit"

step "6.4 — URL map + HTTPS proxy + managed cert"
if ! gcloud compute ssl-certificates describe gon-cert >/dev/null 2>&1; then
  gcloud compute ssl-certificates create gon-cert \
    --domains="${GON_DOMAIN}"
  note "managed cert requested for ${GON_DOMAIN} (provisions AFTER DNS points at the LB)"
fi
if ! gcloud compute url-maps describe gon-lb >/dev/null 2>&1; then
  gcloud compute url-maps create gon-lb \
    --default-service="gon-web-backend" --global
fi
if ! gcloud compute target-https-proxies describe gon-https-proxy >/dev/null 2>&1; then
  gcloud compute target-https-proxies create gon-https-proxy \
    --url-map="gon-lb" --ssl-certificates="gon-cert" --global
fi

step "6.5 — forwarding rules (443 + 80->443 redirect)"
if ! gcloud compute forwarding-rules describe gon-https-rule --global >/dev/null 2>&1; then
  gcloud compute forwarding-rules create gon-https-rule \
    --address="gon-lb-ip" --global \
    --target-https-proxy="gon-https-proxy" --ports="443" \
    --load-balancing-scheme="EXTERNAL_MANAGED"
fi
if ! gcloud compute url-maps describe gon-redirect >/dev/null 2>&1; then
  gcloud compute url-maps import gon-redirect --global --source=/dev/stdin <<'EOF'
name: gon-redirect
defaultUrlRedirect:
  httpsRedirect: true
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
EOF
fi
if ! gcloud compute target-http-proxies describe gon-http-proxy >/dev/null 2>&1; then
  gcloud compute target-http-proxies create gon-http-proxy --url-map="gon-redirect"
fi
if ! gcloud compute forwarding-rules describe gon-http-rule --global >/dev/null 2>&1; then
  gcloud compute forwarding-rules create gon-http-rule \
    --address="gon-lb-ip" --global \
    --target-http-proxy="gon-http-proxy" --ports="80" \
    --load-balancing-scheme="EXTERNAL_MANAGED"
fi

step "6.6 — DNS (PO action, outside GCP)"
echo "   Create these records for ${GON_DOMAIN}:"
echo "     A     ${GON_DOMAIN}.        -> ${LB_IP}"
echo "   Then wait for the managed cert to become ACTIVE:"
echo "     gcloud compute ssl-certificates list"
echo "   Verify (after ACTIVE):"
echo "     curl -sS https://${GON_DOMAIN}/readyz"
echo "   Optional alternative edge (Cloudflare) recipe:"
echo "     apps/gon-web/deploy/edge-rate-limit/cloudflare-worker.js"
