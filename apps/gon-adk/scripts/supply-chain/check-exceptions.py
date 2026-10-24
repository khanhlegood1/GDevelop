#!/usr/bin/env python3
"""Governed vulnerability-exception gate for the GON ADK dependency graph.

Replaces the bare `pip_audit --ignore-vuln` CI call (P05-R1.12): audits the
DEPLOYABLE graph recorded in `requirements.lock` (never the ambient tooling
environment — maintainer tools like pip-tools/cyclonedx-bom must not create
false findings), then enforces three rules against
`scripts/supply-chain/security-exceptions.toml`:

1. every audited vulnerability must have a recorded, in-date exception;
2. every exception must still match a live finding (otherwise it is stale —
   the fix landed and the pin must move);
3. every exception must not be past its `expires` date.

Exit codes: 0 = clean, 1 = governance failure, 2 = audit could not run.

Usage (from apps/gon-adk):  python scripts/supply-chain/check-exceptions.py
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import subprocess
import sys
import tomllib

HERE = pathlib.Path(__file__).resolve().parent
APP_ROOT = HERE.parents[1]
EXCEPTIONS_PATH = HERE / "security-exceptions.toml"
LOCK_PATH = APP_ROOT / "requirements.lock"


def fail(message: str) -> int:
    print(f"FAIL: {message}")
    return 1


def main() -> int:
    data = tomllib.loads(EXCEPTIONS_PATH.read_text(encoding="utf-8"))
    exceptions = data.get("exceptions", [])
    by_id = {entry["id"]: entry for entry in exceptions}

    proc = subprocess.run(
        [sys.executable, "-m", "pip_audit", "--format", "json", "-r", str(LOCK_PATH)],
        capture_output=True,
        text=True,
    )
    if proc.returncode not in (0, 1):
        print(proc.stderr, file=sys.stderr)
        return 2

    report = json.loads(proc.stdout)
    findings: dict[str, dict] = {}
    for dep in report.get("dependencies", []):
        for vuln in dep.get("vulns", []):
            findings[vuln["id"]] = {"package": dep["name"], "version": dep["version"], **vuln}

    today = dt.date.today()
    problems = 0

    for vuln_id, finding in sorted(findings.items()):
        entry = by_id.get(vuln_id)
        if entry is None:
            problems += fail(
                f"unexplained vulnerability {vuln_id} in {finding['package']} "
                f"{finding['version']} (fix: {', '.join(finding.get('fix_versions', ['?']))}) — "
                f"upgrade the pin or record a governed exception in {EXCEPTIONS_PATH.name}"
            )
            continue
        if entry.get("package") != finding["package"]:
            problems += fail(
                f"exception {vuln_id} records package {entry.get('package')!r} but the "
                f"finding is on {finding['package']!r}"
            )
        expires = dt.date.fromisoformat(str(entry["expires"]))
        if expires < today:
            problems += fail(
                f"exception {vuln_id} EXPIRED on {expires} — re-evaluate now: upgrade "
                f"or renew with fresh justification"
            )
        else:
            print(
                f"OK (governed): {vuln_id} on {finding['package']} {finding['version']} "
                f"— expires {expires}, blocker: {entry.get('upstream_blocker', '?')[:80]}…"
            )

    for vuln_id, entry in sorted(by_id.items()):
        if vuln_id not in findings:
            problems += fail(
                f"stale exception {vuln_id}: no longer reported by pip-audit — the fix "
                f"landed; delete it from {EXCEPTIONS_PATH.name} and upgrade the pin"
            )

    if problems:
        print(f"{problems} supply-chain governance problem(s).")
        return 1
    print(f"Supply-chain exceptions governed: {len(findings)} finding(s), {len(exceptions)} exception(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
