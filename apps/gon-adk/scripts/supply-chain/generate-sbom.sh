#!/usr/bin/env bash
# Regenerate supply-chain artifacts — GON (P05-R1.12)
# Run from apps/gon-adk. Maintainer tooling (NOT part of the deployable graph):
#   python -m pip install "pip-tools==7.6.2" "cyclonedx-bom==5.1.0"
#
# Produces:
#   requirements.lock  — full transitive pins + sha256 hashes (CI installs with --require-hashes)
#   sbom.cdx.json      — CycloneDX SBOM derived from the lock (deterministic)
# and, via npm's built-in SBOM (run in apps/gon-web):
#   ../gon-web/sbom.cdx.json
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "1/3 pip-compile requirements.lock (with hashes)..."
pip-compile --quiet --generate-hashes --extra dev --output-file requirements.lock pyproject.toml

echo "2/3 CycloneDX SBOM for the locked Python graph..."
cyclonedx-py requirements requirements.lock -o sbom.cdx.json --of JSON

echo "3/3 CycloneDX SBOM for the npm graph (npm built-in)..."
( cd ../gon-web && npm sbom --sbom-format cyclonedx > sbom.cdx.json )

echo "Done. Run scripts/supply-chain/check-exceptions.py to validate the audit gate."
