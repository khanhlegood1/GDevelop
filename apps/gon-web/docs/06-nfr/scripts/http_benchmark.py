#!/usr/bin/env python3
"""Small, dependency-free P05 HTTP benchmark for a local dev server.

This is deliberately a smoke benchmark, not a production load test. It uses
Dev Auth and the process-local memory adapter, so its numbers cannot be used
as Cloud Run/PostgreSQL SLO evidence.
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Callable


class LocalClient:
    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.cookie_jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cookie_jar)
        )
        self.csrf_token = ""

    def request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
        *,
        mutation: bool = False,
    ) -> tuple[int, Any, float]:
        data = None
        headers = {"Accept": "application/json", "User-Agent": "gon-p05-benchmark/1.0"}
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if mutation:
            headers["X-CSRF-Token"] = self.csrf_token
            headers["Idempotency-Key"] = str(uuid.uuid4())
            headers["Origin"] = self.base_url
        request = urllib.request.Request(
            f"{self.base_url}{path}", data=data, headers=headers, method=method
        )
        started = time.perf_counter()
        try:
            with self.opener.open(request, timeout=30) as response:
                raw = response.read()
                status = response.status
        except urllib.error.HTTPError as error:
            raw = error.read()
            status = error.code
        elapsed_ms = (time.perf_counter() - started) * 1000
        try:
            payload = json.loads(raw.decode("utf-8")) if raw else None
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = raw.decode("utf-8", errors="replace")
        return status, payload, elapsed_ms

    def data(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        status, payload, _ = self.request(
            method, path, body, mutation=method.upper() not in {"GET", "HEAD"}
        )
        if status >= 400:
            raise RuntimeError(f"{method} {path} failed with {status}: {payload}")
        return payload.get("data", payload) if isinstance(payload, dict) else payload

    def cookie_header(self) -> str:
        return "; ".join(f"{cookie.name}={cookie.value}" for cookie in self.cookie_jar)


def percentile(values: list[float], p: float) -> float:
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((p / 100) * (len(ordered) - 1))))
    return ordered[index]


def summarize(samples: list[tuple[int, float]], wall_ms: float | None = None) -> dict[str, Any]:
    durations = [duration for _, duration in samples]
    statuses: dict[str, int] = {}
    for status, _ in samples:
        statuses[str(status)] = statuses.get(str(status), 0) + 1
    result: dict[str, Any] = {
        "count": len(samples),
        "statuses": statuses,
        "mean_ms": round(statistics.mean(durations), 3),
        "p50_ms": round(percentile(durations, 50), 3),
        "p95_ms": round(percentile(durations, 95), 3),
        "max_ms": round(max(durations), 3),
    }
    if wall_ms:
        result["wall_ms"] = round(wall_ms, 3)
        result["requests_per_second"] = round(len(samples) / (wall_ms / 1000), 3)
    return result


def benchmark(task: Callable[[], tuple[int, Any, float]], count: int, warmup: int = 3) -> dict[str, Any]:
    for _ in range(warmup):
        task()
    samples: list[tuple[int, float]] = []
    started = time.perf_counter()
    for _ in range(count):
        status, _, elapsed = task()
        samples.append((status, elapsed))
    return summarize(samples, (time.perf_counter() - started) * 1000)


def activate(client: LocalClient, invite_code: str) -> None:
    _, csrf_payload, _ = client.request("GET", "/api/csrf")
    client.csrf_token = csrf_payload["data"]["csrfToken"]
    client.data("POST", "/api/dev/session", {"displayName": "P05 Benchmark"})
    bootstrap = client.data("GET", "/v1/me/bootstrap")
    if bootstrap.get("account", {}).get("status") != "active":
        client.data(
            "POST",
            "/v1/me/age-attestation",
            {
                "isAtLeast18": True,
                "termsVersion": "terms-alpha-v1",
                "privacyVersion": "privacy-alpha-v1",
                "personalizationFootprint": "denied",
                "inviteCode": invite_code,
            },
        )
    bootstrap = client.data("GET", "/v1/me/bootstrap")
    if bootstrap.get("account", {}).get("status") != "active":
        raise RuntimeError(f"Benchmark account is not active: {bootstrap}")


def concurrent_bootstrap(client: LocalClient, total: int, workers: int) -> dict[str, Any]:
    cookie_header = client.cookie_header()

    def one(_: int) -> tuple[int, float]:
        request = urllib.request.Request(
            f"{client.base_url}/v1/me/bootstrap",
            headers={
                "Accept": "application/json",
                "Cookie": cookie_header,
                "User-Agent": "gon-p05-benchmark/1.0",
            },
            method="GET",
        )
        started = time.perf_counter()
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                response.read()
                status = response.status
        except urllib.error.HTTPError as error:
            error.read()
            status = error.code
        return status, (time.perf_counter() - started) * 1000

    samples: list[tuple[int, float]] = []
    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(one, index) for index in range(total)]
        for future in as_completed(futures):
            samples.append(future.result())
    return summarize(samples, (time.perf_counter() - started) * 1000)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:3000")
    parser.add_argument("--invite-code", default="p05-local-invite")
    parser.add_argument("--read-count", type=int, default=50)
    parser.add_argument("--search-count", type=int, default=10)
    parser.add_argument("--concurrent-total", type=int, default=50)
    parser.add_argument("--concurrent-workers", type=int, default=10)
    args = parser.parse_args()

    client = LocalClient(args.base_url)
    activate(client, args.invite_code)

    nonce = uuid.uuid4().hex[:10]
    project = client.data(
        "POST",
        "/v1/projects",
        {
            "title": f"P05 benchmark {nonce}",
            "prompt": (
                "Giải thích cách phân tích bằng chứng về một xu hướng âm nhạc, "
                "phân biệt tương quan và nhân quả, rồi áp dụng vào một ví dụ mới."
            ),
            "goal": "Tạo bản giải thích có trích dẫn và kiểm tra transfer",
            "learningMode": "deep_mastery",
            "depth": "standard",
            "timeBudgetMinutes": 30,
            "locale": "vi-VN",
        },
    )
    project_id = project["id"]
    search = client.data("POST", f"/v1/projects/{project_id}/search-attempts", {})

    brew_status, brew_payload, brew_ms = client.request(
        "POST",
        f"/v1/projects/{project_id}/brew-jobs",
        {"searchAttemptId": search["id"], "confirmed": True},
        mutation=True,
    )

    results: dict[str, Any] = {
        "baseUrl": args.base_url,
        "environment": "local Next.js dev server + memory store + deterministic adapters",
        "setup": {
            "projectId": project_id,
            "initialSearchVerdict": search.get("verdict"),
            "brew": {
                "httpStatus": brew_status,
                "jobStatus": (brew_payload.get("data") or {}).get("status")
                if isinstance(brew_payload, dict)
                else None,
                "elapsed_ms": round(brew_ms, 3),
                "samples": 1,
            },
        },
        "sequential": {
            "GET /": benchmark(lambda: client.request("GET", "/"), 20),
            "GET /v1/me/bootstrap": benchmark(
                lambda: client.request("GET", "/v1/me/bootstrap"), args.read_count
            ),
            "GET /v1/projects?limit=30": benchmark(
                lambda: client.request("GET", "/v1/projects?limit=30"), args.read_count
            ),
            "GET /v1/projects/{id}/workspace": benchmark(
                lambda: client.request("GET", f"/v1/projects/{project_id}/workspace"),
                args.read_count,
            ),
            "POST /v1/projects/{id}/search-attempts": benchmark(
                lambda: client.request(
                    "POST", f"/v1/projects/{project_id}/search-attempts", {}, mutation=True
                ),
                args.search_count,
            ),
        },
        "concurrent": {
            "GET /v1/me/bootstrap": concurrent_bootstrap(
                client, args.concurrent_total, args.concurrent_workers
            )
        },
        "limitations": [
            "Next.js dev mode, one local process, one synthetic user/project",
            "memory store and deterministic local embedding/Brew only",
            "no PostgreSQL, Gemini/ADK, Cloud Run, queue, network latency or browser rendering",
        ],
    }
    json.dump(results, sys.stdout, ensure_ascii=False, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
