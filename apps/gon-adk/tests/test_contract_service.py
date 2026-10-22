from __future__ import annotations

import asyncio
import copy
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from gon_adk.config import Settings
from gon_adk.contracts import (
    ContractCatalog,
    ContractValidationError,
    stable_sha256,
    validate_generate_output_semantics,
)
from gon_adk.local_provider import LocalDeterministicProvider
from gon_adk.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[3]
CONTRACTS_DIR = REPO_ROOT / "apps" / "gon-web" / "docs" / "04-contracts"
EXAMPLES_DIR = CONTRACTS_DIR / "examples"
TOKEN = "test-service-token"
HEADERS = {"X-GON-Service-Token": TOKEN}


def load_example(name: str) -> dict:
    return json.loads((EXAMPLES_DIR / name).read_text(encoding="utf-8"))


def make_settings(
    provider: str = "local", model_id: str | None = None, **overrides: object
) -> Settings:
    values: dict[str, object] = {
        "service_token": TOKEN,
        "allow_unauthenticated_local": False,
        "provider": provider,
        "model_id": model_id,
        "contracts_dir": CONTRACTS_DIR,
        "request_timeout_seconds": 10,
        "max_body_bytes": 2_500_000,
        "environment": "local",
    }
    values.update(overrides)
    return Settings(**values)  # type: ignore[arg-type]


def make_client(
    provider: str = "local", model_id: str | None = None, **overrides: object
) -> TestClient:
    return TestClient(create_app(make_settings(provider, model_id, **overrides)))


def test_health_reports_no_database_or_publish_access() -> None:
    response = make_client().get("/healthz")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "gon-adk"
    assert body["schemasReady"] is True
    assert body["databaseAccess"] is False
    assert body["publishAccess"] is False


def test_service_auth_is_required() -> None:
    response = make_client().post(
        "/v1/topic-check", json=load_example("agent-topic-check-input.json")
    )
    assert response.status_code == 401
    assert response.json()["code"] == "SERVICE_AUTH_FAILED"


def test_topic_check_accepts_the_p03_example() -> None:
    response = make_client().post(
        "/v1/topic-check",
        headers=HEADERS,
        json=load_example("agent-topic-check-input.json"),
    )
    assert response.status_code == 200
    assert response.json()["decision"] == "allow"


def test_invalid_input_is_a_contract_problem_not_a_provider_call() -> None:
    response = make_client().post(
        "/v1/topic-check", headers=HEADERS, json={"schemaVersion": "wrong"}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "CONTRACT_VALIDATION_FAILED"


def test_local_generate_module_is_evidence_bound() -> None:
    payload = load_example("agent-generate-input.json")
    response = make_client().post(
        "/v1/generate-module", headers=HEADERS, json=payload
    )
    assert response.status_code == 200, response.text
    output = response.json()
    assert output["generation"]["evidenceBundleHash"] == stable_sha256(
        payload["evidenceBundle"]
    )
    evidence_ids = {item["sourceId"] for item in payload["evidenceBundle"]}
    graph_ids = {item["id"] for item in output["moduleGraph"]["sources"]}
    assert graph_ids <= evidence_ids
    node_types = {node["type"] for node in output["moduleGraph"]["nodes"]}
    assert {"concept", "retrieval", "transfer", "boss_proof"} <= node_types


def test_citation_outside_the_evidence_bundle_is_rejected() -> None:
    payload = load_example("agent-generate-input.json")
    output = asyncio.run(LocalDeterministicProvider().generate_module(payload))
    tampered = copy.deepcopy(output)
    tampered["moduleGraph"]["sources"][0]["id"] = "src_invented_outside_bundle"
    tampered["moduleGraph"]["nodes"][0]["citations"][0][
        "sourceId"
    ] = "src_invented_outside_bundle"

    with pytest.raises(ContractValidationError):
        validate_generate_output_semantics(
            ContractCatalog(CONTRACTS_DIR), tampered, payload
        )


def test_local_assessment_keeps_criterion_ids_and_reviews_copy_similarity() -> None:
    payload = load_example("agent-assess-input.json")
    payload["answer"]["text"] = payload["node"]["content"]["sampleAnswer"]
    response = make_client().post(
        "/v1/assess-attempt", headers=HEADERS, json=payload
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["decision"] == "pending_human_review"
    assert {
        item["criterionId"] for item in body["criteria"]
    } == {item["id"] for item in payload["rubric"]["criteria"]}


def test_oversized_declared_and_streamed_bodies_are_rejected() -> None:
    client = make_client(max_body_bytes=16)

    declared = client.post(
        "/v1/topic-check",
        headers={**HEADERS, "Content-Type": "application/json"},
        content=b"x" * 17,
    )
    assert declared.status_code == 413
    assert declared.json()["code"] == "REQUEST_TOO_LARGE"

    streamed = client.post(
        "/v1/topic-check",
        headers={**HEADERS, "Content-Type": "application/json"},
        content=iter([b"x" * 10, b"x" * 10]),
    )
    assert streamed.status_code == 413
    assert streamed.json()["code"] == "REQUEST_TOO_LARGE"


def test_unauthenticated_local_flag_is_ignored_outside_local() -> None:
    client = make_client(
        service_token=None,
        allow_unauthenticated_local=True,
        environment="staging",
    )
    assert client.get("/healthz").json()["status"] == "degraded"
    response = client.post(
        "/v1/topic-check", json=load_example("agent-topic-check-input.json")
    )
    assert response.status_code == 503
    assert response.json()["code"] == "SERVICE_AUTH_NOT_CONFIGURED"


def test_google_provider_fails_closed_without_a_model() -> None:
    response = make_client("google", model_id=None).post(
        "/v1/topic-check",
        headers=HEADERS,
        json=load_example("agent-topic-check-input.json"),
    )
    assert response.status_code == 503
    assert response.json()["code"] == "PROVIDER_NOT_CONFIGURED"
