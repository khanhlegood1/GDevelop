#!/usr/bin/env bash
# P05-R1.15 — Local staging-verification probe runner (GON web).
#
# Runs the P05 local probe suite (HTTP benchmark + DAST-equivalent security
# probes) against throwaway dev servers (memory store, Dev Auth, seeded
# invite) and saves raw JSON results into ./results/.
#
# Each phase runs against a FRESH server instance. Abuse policy per phase:
# - Security probe + guard-engagement: DEFAULT R1.10 controls (the point is
#   to verify behavior under the shipped policy).
# - Latency benchmarks: guards explicitly RELAXED via GON_ABUSE_* env — the
#   default flood window (120 strikes/10s/IP) would otherwise box the
#   benchmark mid-run (observed 2026-10-24: controls engage exactly at the
#   documented threshold). Latency passes measure app latency, not guards;
#   guard behavior is covered by the dedicated engagement phase.
#
# Evidence labels: these are LOCAL/HERMETIC probes on the memory adapter —
# they are NOT staging load tests and NOT a substitute for ZAP/Burp or an
# independent pentest. Re-run the same probes against real staging (managed
# PostgreSQL + Google Auth) as part of P06 using staging-checklist.md.
#
# Usage: bash run-local-probes.sh [--base-url http://127.0.0.1:3000]
# Exit code: 0 when all probes pass, 1 otherwise.

set -euo pipefail

BASE_URL="http://127.0.0.1:3000"
if [ "${1:-}" = "--base-url" ]; then BASE_URL="${2:-http://127.0.0.1:3000}"; fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PROBE_DIR="${APP_DIR}/docs/06-nfr/scripts"
RESULTS_DIR="${SCRIPT_DIR}/results"
INVITE_CODE="p05-local-invite"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

SERVER_PID=""

mkdir -p "${RESULTS_DIR}"

start_server() {
  # $1 = phase label, $2 = policy: "default" (R1.10 controls active) or
  # "relaxed" (latency-focused pass: guards explicitly raised via env so the
  # benchmark measures app latency, not the 120-strikes/10s flood window).
  local phase="$1"
  local policy="${2:-default}"
  if curl -sf "${BASE_URL}/api/csrf" > /dev/null 2>&1; then
    echo "[run-local-probes] Reusing already-running server at ${BASE_URL}"
    return
  fi
  echo "[run-local-probes] Starting fresh GON dev server (memory store, Dev Auth, ${policy} abuse policy)..."
  # setsid: run npm as a process-group leader so stop_server can kill the
  # whole tree (npm -> node -> next dev); killing the npm wrapper alone
  # leaves the Next dev server alive on port 3000.
  local guard_env=()
  if [ "${policy}" = "relaxed" ]; then
    guard_env=(
      GON_ABUSE_FLOOD_STRIKE_LIMIT=100000
      GON_ABUSE_IP_READ_CAPACITY=100000
    )
  fi
  env \
    GON_DEV_AUTH=1 \
    GON_DEV_INVITE_CODE="${INVITE_CODE}" \
    NEXT_TELEMETRY_DISABLED=1 \
    "${guard_env[@]}" \
    setsid npm run dev -- --port 3000 --hostname 127.0.0.1 > "${RESULTS_DIR}/dev-server-${STAMP}-${phase}.log" 2>&1 &
  SERVER_PID=$!
  local ready=0
  local attempt
  for attempt in $(seq 1 90); do
    if curl -sf "${BASE_URL}/api/csrf" > /dev/null 2>&1; then ready=1; break; fi
    sleep 1
  done
  if [ "${ready}" != "1" ]; then
    echo "[run-local-probes] Server did not become ready at ${BASE_URL}; see ${RESULTS_DIR}/dev-server-${STAMP}-${phase}.log" >&2
    exit 1
  fi
}

stop_server() {
  if [ -n "${SERVER_PID}" ]; then
    # Kill the whole process group (see setsid note in start_server).
    kill -- -"${SERVER_PID}" 2>/dev/null || kill "${SERVER_PID}" 2>/dev/null || true
    local attempt
    for attempt in $(seq 1 30); do
      if ! curl -sf --max-time 2 "${BASE_URL}/api/csrf" > /dev/null 2>&1; then break; fi
      sleep 1
    done
    if curl -sf --max-time 2 "${BASE_URL}/api/csrf" > /dev/null 2>&1; then
      echo "[run-local-probes] WARNING: server still responding after stop_server; subsequent phases will reuse it (evidence tainted)" >&2
    fi
    SERVER_PID=""
  fi
}

trap stop_server EXIT

OVERALL=0

# ---------------------------------------------------------------------------
# Phase 1 — DAST-equivalent security probes on a fresh server
# (auth, CSRF/origin, spoofed proxy headers, idempotency, JSON errors,
#  body limit, headers).
# ---------------------------------------------------------------------------
start_server security default
echo "[run-local-probes] Phase 1/4: security probe..."
if python3 "${PROBE_DIR}/http_security_probe.py" \
    --base-url "${BASE_URL}" \
    --invite-code "${INVITE_CODE}" \
    > "${RESULTS_DIR}/local-${STAMP}-security-probe.json"; then
  echo "[run-local-probes] Phase 1 PASS"
else
  echo "[run-local-probes] Phase 1 FAIL" >&2
  OVERALL=1
fi
stop_server

# ---------------------------------------------------------------------------
# Phase 2 — HTTP benchmark (baseline, same counts as the original P05 review).
# ---------------------------------------------------------------------------
start_server bench relaxed
echo "[run-local-probes] Phase 2/4: benchmark (baseline)..."
if python3 "${PROBE_DIR}/http_benchmark.py" \
    --base-url "${BASE_URL}" \
    --invite-code "${INVITE_CODE}" \
    > "${RESULTS_DIR}/local-${STAMP}-benchmark.json"; then
  echo "[run-local-probes] Phase 2 PASS"
else
  echo "[run-local-probes] Phase 2 FAIL" >&2
  OVERALL=1
fi
stop_server

# ---------------------------------------------------------------------------
# Phase 3 — Heavier concurrent pass, still under the default 240-token IP
# read burst (latency-focused; ~80 reads + 3 warmups + 150 concurrent).
# ---------------------------------------------------------------------------
start_server heavy relaxed
echo "[run-local-probes] Phase 3/4: benchmark (heavy concurrent pass)..."
if python3 "${PROBE_DIR}/http_benchmark.py" \
    --base-url "${BASE_URL}" \
    --invite-code "${INVITE_CODE}" \
    --read-count 80 --search-count 20 --concurrent-total 150 --concurrent-workers 20 \
    > "${RESULTS_DIR}/local-${STAMP}-benchmark-heavy.json"; then
  echo "[run-local-probes] Phase 3 PASS"
else
  echo "[run-local-probes] Phase 3 FAIL (inspect output: a RATE_LIMITED here would mean the default controls engaged — record honestly)" >&2
  OVERALL=1
fi
stop_server

# ---------------------------------------------------------------------------
# Phase 4 — Guard-engagement probe (R1.10 controls, EXPECTED 429).
# Fires an anonymous burst far above the default IP read burst and asserts
# the server answers with 429 RATE_LIMITED + Retry-After — i.e. the abuse
# controls demonstrably engage under a flood. This is local evidence for
# B-P05-06 (origin layer), not a distributed/edge load test.
# ---------------------------------------------------------------------------
start_server guard default
echo "[run-local-probes] Phase 4/4: guard-engagement probe (expects RATE_LIMITED)..."
if python3 - "${BASE_URL}" > "${RESULTS_DIR}/local-${STAMP}-guard-engagement.json" <<'PYEOF'
import json
import sys
import urllib.error
import urllib.request

base_url = sys.argv[1]
statuses = {}
rate_limited_with_retry_after = 0
total = 400
for _ in range(total):
    request = urllib.request.Request(
        f"{base_url}/v1/me/bootstrap",
        headers={"Accept": "application/json", "User-Agent": "gon-guard-probe/1.0"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()
            status = response.status
            retry_after = response.headers.get("Retry-After")
    except urllib.error.HTTPError as error:
        raw = error.read()
        status = error.code
        retry_after = error.headers.get("Retry-After")
        if status == 429:
            try:
                payload = json.loads(raw.decode("utf-8"))
            except (UnicodeDecodeError, json.JSONDecodeError):
                payload = {}
            if payload.get("code") == "RATE_LIMITED" and retry_after:
                rate_limited_with_retry_after += 1
    statuses[str(status)] = statuses.get(str(status), 0) + 1

result = {
    "total_requests": total,
    "status_counts": statuses,
    "rate_limited_with_retry_after": rate_limited_with_retry_after,
    "engaged": rate_limited_with_retry_after > 0,
}
print(json.dumps(result, indent=2))
sys.exit(0 if result["engaged"] else 1)
PYEOF
then
  echo "[run-local-probes] Phase 4 PASS (controls engaged)"
else
  echo "[run-local-probes] Phase 4 FAIL (no RATE_LIMITED+Retry-After observed — guards may be misconfigured)" >&2
  OVERALL=1
fi
stop_server

echo "[run-local-probes] Results:"
ls -1 "${RESULTS_DIR}/local-${STAMP}-"*.json

if [ "${OVERALL}" -ne 0 ]; then
  echo "[run-local-probes] FAILED" >&2
  exit 1
fi

echo "[run-local-probes] PASS — local/hermetic evidence only (see staging-checklist.md for the staging re-run)."
