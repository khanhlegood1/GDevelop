#!/usr/bin/env bash
# P06-S1 / 70 — observability: uptime check, alert policies, budget alert.
# B-P05-07. NOT RUN in the dev sandbox.
#
# Honest scope: these are REFERENCE policies with sensible staging defaults.
# Thresholds/labels must be reviewed by the PO when real traffic exists
# (decision D8). The scripts use the public Monitoring/Billing APIs via curl
# because gcloud's coverage of these resources is alpha/beta-only.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
source "${SCRIPT_DIR}/lib/common.sh"

require_gcloud

TOKEN="$(gcloud auth print-access-token)"
MON="https://monitoring.googleapis.com/v3/projects/${GCP_PROJECT_ID}"

step "7.0 — email notification channel (PO must verify it in the console)"
CHANNEL_NAME="$(
  curl -fsS -X POST -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
    "${MON}/notificationChannels" \
    -d "{\"type\":\"email\",\"displayName\":\"GON ops\",\"labels\":{\"email_address\":\"${ALERT_EMAIL}\"}}" \
    | python3 -c 'import json,sys;print(json.load(sys.stdin)["name"])'
)"
note "channel: ${CHANNEL_NAME} (verify via console -> Monitoring -> Alerting)"

upsert_policy() {
  local file="$1"
  python3 - "${CHANNEL_NAME}" "${file}" <<'PY'
import json, sys
channel, path = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as handle:
    policy = json.load(handle)
policy.setdefault("notificationChannels", []).append(channel)
policy["enabled"] = True
with open(path, "w", encoding="utf-8") as handle:
    json.dump(policy, handle)
PY
  curl -fsS -X POST -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
    "${MON}/alertPolicies" -d @"${file}" >/dev/null
}

step "7.1 — uptime check on https://${GON_DOMAIN}/healthz"
curl -fsS -X POST -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  "${MON}/uptimeConfigs" -d "{
    \"displayName\": \"GON web liveness\",
    \"monitoredResource\": {\"type\": \"uptime_url\", \"labels\": {\"host\": \"${GON_DOMAIN}\"}},
    \"httpCheck\": {\"path\": \"/healthz\", \"port\": 443, \"requestMethod\": \"GET\"},
    \"period\": \"300s\", \"timeout\": \"10s\"
  }" >/dev/null || echo "   NOTE: uptime config exists or ${GON_DOMAIN} not resolvable yet — re-run after DNS."
note "uptime check created for https://${GON_DOMAIN}/healthz"

step "7.2 — alert: gon-web 5xx rate"
POLICY_5XX="$(mktemp /tmp/gon-policy-5xx.XXXX.json)"
cat > "${POLICY_5XX}" <<EOF
{
  "displayName": "GON web 5xx rate",
  "combiner": "OR",
  "conditions": [{
    "displayName": "5xx responses > 1/min",
    "conditionThreshold": {
      "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${RUN_SERVICE_WEB}\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"500\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": 1,
      "duration": "300s",
      "aggregations": [{"alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_RATE"}]
    }
  }]
}
EOF
upsert_policy "${POLICY_5XX}"
rm -f "${POLICY_5XX}"

step "7.3 — alert: gon-web p95 latency"
POLICY_LAT="$(mktemp /tmp/gon-policy-lat.XXXX.json)"
cat > "${POLICY_LAT}" <<EOF
{
  "displayName": "GON web p95 latency",
  "combiner": "OR",
  "conditions": [{
    "displayName": "p95 latency > 1500ms for 5m",
    "conditionThreshold": {
      "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"${RUN_SERVICE_WEB}\" AND metric.type=\"run.googleapis.com/request_latencies\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": 1500,
      "duration": "300s",
      "aggregations": [{"alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_PERCENTILE_95"}]
    }
  }]
}
EOF
upsert_policy "${POLICY_LAT}"
rm -f "${POLICY_LAT}"

step "7.4 — alert: Cloud SQL availability"
POLICY_SQL="$(mktemp /tmp/gon-policy-sql.XXXX.json)"
cat > "${POLICY_SQL}" <<EOF
{
  "displayName": "GON Cloud SQL down",
  "combiner": "OR",
  "conditions": [{
    "displayName": "database up == 0 for 5m",
    "conditionThreshold": {
      "filter": "resource.type=\"cloudsql_database\" AND resource.labels.database_id=\"${GCP_PROJECT_ID}:${SQL_INSTANCE}\" AND metric.type=\"cloudsql.googleapis.com/database/up\"",
      "comparison": "COMPARISON_LT",
      "thresholdValue": 1,
      "duration": "300s",
      "aggregations": [{"alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_MAX"}]
    }
  }]
}
EOF
upsert_policy "${POLICY_SQL}"
rm -f "${POLICY_SQL}"

step "7.5 — budget alert (50% / 90% / 100%)"
if [[ -z "${BILLING_ACCOUNT_ID}" ]]; then
  echo "   SKIPPED: BILLING_ACCOUNT_ID empty in gcp.env (gcloud billing accounts list)."
else
  for pct in 0.5 0.9 1.0; do
    curl -fsS -X POST -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
      "https://billingbudgets.googleapis.com/v1/billingAccounts/${BILLING_ACCOUNT_ID}/budgets" -d "{
        \"displayName\": \"GON staging ${pct}\",
        \"budgetFilter\": {\"projects\": [\"projects/${GCP_PROJECT_ID}\"]},
        \"amount\": {\"specifiedAmount\": {\"units\": \"$(python3 -c "print(${BUDGET_AMOUNT_MICROS} // 1000000)")\"}},
        \"thresholdRules\": [{\"thresholdPercent\": ${pct}}],
        \"notificationsRule\": {\"monitoringNotificationChannels\": [\"${CHANNEL_NAME}\"]}
      }" >/dev/null && note "budget rule at ${pct} created" || echo "   NOTE: budget at ${pct} may already exist"
  done
fi

step "OK — dashboard/finetuning is PO work on real traffic (see README D8)"
