#!/usr/bin/env python3
"""Dependency-free DAST-equivalent probes for a local GON dev server.

The probes check authentication, CSRF/origin handling, proxy-header spoofing,
idempotency-key enforcement, JSON errors, the bounded body limit and selected
response headers. They are not a substitute for a staging ZAP/Burp run or an
independent penetration test.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
import uuid
from typing import Any

from http_benchmark import LocalClient, activate


def raw_request(
    client: LocalClient,
    method: str,
    path: str,
    *,
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, Any, dict[str, str]]:
    request_headers = {"Accept": "application/json", "User-Agent": "gon-p05-security-probe/1.0"}
    request_headers.update(headers or {})
    request = urllib.request.Request(
        f"{client.base_url}{path}", data=body, headers=request_headers, method=method
    )
    try:
        with client.opener.open(request, timeout=30) as response:
            raw = response.read()
            return response.status, decode(raw), dict(response.headers.items())
    except urllib.error.HTTPError as error:
        return error.code, decode(error.read()), dict(error.headers.items())


def decode(raw: bytes) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return raw.decode("utf-8", errors="replace")


def problem_code(payload: Any) -> str | None:
    return payload.get("code") if isinstance(payload, dict) else None


def check(name: str, actual: int, expected: int, payload: Any = None) -> dict[str, Any]:
    return {
        "name": name,
        "passed": actual == expected,
        "expectedStatus": expected,
        "actualStatus": actual,
        "problemCode": problem_code(payload),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument("--invite-code", default="p05-local-invite")
    parser.add_argument(
        "--expect-production-headers",
        action="store_true",
        help="Also require CSP and HSTS; use only against a production build.",
    )
    args = parser.parse_args()

    checks: list[dict[str, Any]] = []

    anonymous = LocalClient(args.base_url)
    status, payload, _ = anonymous.request("GET", "/v1/me/bootstrap")
    checks.append(check("authentication is required for bootstrap", status, 401, payload))

    client = LocalClient(args.base_url)
    activate(client, args.invite_code)

    project_body = json.dumps(
        {
            "prompt": "Security probe project",
            "goal": "Probe only",
            "learningMode": "deep_mastery",
            "depth": "standard",
            "timeBudgetMinutes": 15,
            "locale": "vi-VN",
        }
    ).encode()

    status, payload, _ = raw_request(
        client,
        "POST",
        "/v1/projects",
        body=project_body,
        headers={
            "Content-Type": "application/json",
            "Origin": args.base_url,
            "Idempotency-Key": str(uuid.uuid4()),
        },
    )
    checks.append(check("mutation without CSRF token is rejected", status, 403, payload))

    status, payload, _ = raw_request(
        client,
        "POST",
        "/v1/projects",
        body=project_body,
        headers={
            "Content-Type": "application/json",
            "Origin": "https://attacker.example",
            "X-Forwarded-Host": "attacker.example",
            "X-CSRF-Token": client.csrf_token,
            "Idempotency-Key": str(uuid.uuid4()),
        },
    )
    checks.append(
        check("spoofed forwarded host does not satisfy same-origin", status, 403, payload)
    )

    status, payload, _ = raw_request(
        client,
        "POST",
        "/v1/projects",
        body=project_body,
        headers={
            "Content-Type": "application/json",
            "Origin": args.base_url,
            "X-CSRF-Token": client.csrf_token,
        },
    )
    checks.append(check("mutation without Idempotency-Key is rejected", status, 400, payload))

    status, payload, _ = raw_request(
        client,
        "POST",
        "/v1/projects",
        body=b"{not-json",
        headers={
            "Content-Type": "application/json",
            "Origin": args.base_url,
            "X-CSRF-Token": client.csrf_token,
            "Idempotency-Key": str(uuid.uuid4()),
        },
    )
    checks.append(check("invalid JSON returns a controlled problem response", status, 400, payload))

    oversized = b'{"prompt":"' + (b"x" * 2_500_000) + b'"}'
    status, payload, _ = raw_request(
        client,
        "POST",
        "/v1/projects",
        body=oversized,
        headers={
            "Content-Type": "application/json",
            "Origin": args.base_url,
            "X-CSRF-Token": client.csrf_token,
            "Idempotency-Key": str(uuid.uuid4()),
        },
    )
    checks.append(check("JSON body over 2,500,000 bytes is rejected", status, 413, payload))

    status, payload, headers = raw_request(client, "GET", "/")
    header_names = {key.lower(): value for key, value in headers.items()}
    required_headers = [
        "x-content-type-options",
        "referrer-policy",
        "x-frame-options",
        "cross-origin-opener-policy",
        "cross-origin-resource-policy",
        "permissions-policy",
    ]
    if args.expect_production_headers:
        required_headers += ["content-security-policy", "strict-transport-security"]
    missing = [header for header in required_headers if header not in header_names]
    checks.append(
        {
            "name": "expected browser security headers are present",
            "passed": status == 200 and not missing,
            "expectedStatus": 200,
            "actualStatus": status,
            "missingHeaders": missing,
            "cacheControl": header_names.get("cache-control"),
        }
    )

    failed = [item for item in checks if not item["passed"]]
    json.dump(
        {
            "baseUrl": args.base_url,
            "environment": "authenticated local HTTP probe; not staging/production DAST",
            "passed": len(checks) - len(failed),
            "failed": len(failed),
            "checks": checks,
        },
        sys.stdout,
        ensure_ascii=False,
        indent=2,
    )
    sys.stdout.write("\n")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
