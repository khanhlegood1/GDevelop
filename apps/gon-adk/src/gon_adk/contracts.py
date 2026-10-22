from __future__ import annotations

import hashlib
import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

AGENT_SCHEMA_ID = "https://gon.org/schemas/agent-contracts/1.0/schema.json"
GRAPH_SCHEMA_ID = "https://gon.org/schemas/module-graph/1.0/schema.json"

OPERATION_SCHEMAS = {
    "topic_input": f"{AGENT_SCHEMA_ID}#/$defs/TopicCheckInput",
    "topic_output": f"{AGENT_SCHEMA_ID}#/$defs/TopicCheckOutput",
    "generate_input": f"{AGENT_SCHEMA_ID}#/$defs/GenerateModuleInput",
    "generate_output": f"{AGENT_SCHEMA_ID}#/$defs/GenerateModuleOutput",
    "assess_input": f"{AGENT_SCHEMA_ID}#/$defs/AssessAttemptInput",
    "assess_output": f"{AGENT_SCHEMA_ID}#/$defs/AssessAttemptOutput",
}


class ContractValidationError(ValueError):
    def __init__(self, message: str, details: list[str] | None = None) -> None:
        super().__init__(message)
        self.details = details or []


def stable_sha256(value: Any) -> str:
    payload = json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


class ContractCatalog:
    """Loads approved P03 schemas from the monorepo; schemas are never retyped."""

    def __init__(self, contracts_dir: Path) -> None:
        self.contracts_dir = contracts_dir
        schemas_dir = contracts_dir / "schemas"
        agent_path = schemas_dir / "agent-contracts.schema.json"
        graph_path = schemas_dir / "canonical-module-graph.schema.json"
        if not agent_path.is_file() or not graph_path.is_file():
            raise FileNotFoundError(
                "P03 schemas were not found. Set GON_CONTRACTS_DIR to "
                "apps/gon-web/docs/04-contracts."
            )
        self.agent_schema = json.loads(agent_path.read_text(encoding="utf-8"))
        self.graph_schema = json.loads(graph_path.read_text(encoding="utf-8"))
        self.registry: Registry = Registry().with_resources(
            [
                (
                    AGENT_SCHEMA_ID,
                    Resource.from_contents(
                        self.agent_schema, default_specification=DRAFT202012
                    ),
                ),
                (
                    GRAPH_SCHEMA_ID,
                    Resource.from_contents(
                        self.graph_schema, default_specification=DRAFT202012
                    ),
                ),
            ]
        )

    @lru_cache(maxsize=16)
    def _validator(self, schema_ref: str) -> Draft202012Validator:
        return Draft202012Validator({"$ref": schema_ref}, registry=self.registry)

    def validate(self, operation: str, instance: Any) -> None:
        schema_ref = OPERATION_SCHEMAS[operation]
        errors = sorted(
            self._validator(schema_ref).iter_errors(instance),
            key=lambda error: (list(error.absolute_path), error.message),
        )
        if errors:
            details = []
            for error in errors[:20]:
                location = ".".join(str(part) for part in error.absolute_path) or "$"
                details.append(f"{location}: {error.message}")
            raise ContractValidationError(
                f"Payload does not satisfy {operation} JSON Schema.", details
            )

    def validate_module_graph(self, graph: Any) -> None:
        validator = self._validator(GRAPH_SCHEMA_ID)
        errors = sorted(
            validator.iter_errors(graph),
            key=lambda error: (list(error.absolute_path), error.message),
        )
        if errors:
            details = []
            for error in errors[:20]:
                location = ".".join(str(part) for part in error.absolute_path) or "$"
                details.append(f"{location}: {error.message}")
            raise ContractValidationError(
                "Module graph does not satisfy gon.module-graph/1.0.", details
            )


def _duplicates(values: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for value in values:
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return sorted(duplicates)


def _semantic_errors_for_graph(
    graph: dict[str, Any], generate_input: dict[str, Any] | None = None
) -> list[str]:
    errors: list[str] = []
    module = graph.get("module") or {}
    concepts = module.get("concepts") or []
    outcomes = module.get("outcomes") or []
    sources = graph.get("sources") or []
    nodes = graph.get("nodes") or []
    edges = graph.get("edges") or []
    rubrics = graph.get("rubrics") or []

    concept_ids = [str(item.get("id")) for item in concepts]
    outcome_ids = [str(item.get("id")) for item in outcomes]
    source_ids = [str(item.get("id")) for item in sources]
    node_ids = [str(item.get("id")) for item in nodes]
    rubric_ids = [str(item.get("id")) for item in rubrics]

    for label, ids in (
        ("concept", concept_ids),
        ("outcome", outcome_ids),
        ("source", source_ids),
        ("node", node_ids),
        ("rubric", rubric_ids),
    ):
        duplicates = _duplicates(ids)
        if duplicates:
            errors.append(f"Duplicate {label} IDs: {', '.join(duplicates)}")

    concept_set = set(concept_ids)
    source_set = set(source_ids)
    node_set = set(node_ids)
    rubric_set = set(rubric_ids)

    for outcome in outcomes:
        missing = sorted(set(outcome.get("conceptIds") or []) - concept_set)
        if missing:
            errors.append(
                f"Outcome {outcome.get('id')} references unknown concepts: {', '.join(missing)}"
            )

    missing_prerequisites = sorted(set(module.get("prerequisites") or []) - concept_set)
    if missing_prerequisites:
        errors.append(
            "Module prerequisites reference unknown concepts: "
            + ", ".join(missing_prerequisites)
        )

    node_types: set[str] = set()
    for node in nodes:
        node_types.add(str(node.get("type")))
        missing_concepts = sorted(set(node.get("conceptIds") or []) - concept_set)
        if missing_concepts:
            errors.append(
                f"Node {node.get('id')} references unknown concepts: {', '.join(missing_concepts)}"
            )
        for citation in node.get("citations") or []:
            if citation.get("sourceId") not in source_set:
                errors.append(
                    f"Node {node.get('id')} cites unknown graph source {citation.get('sourceId')}"
                )
        assessment = node.get("assessment")
        if assessment and assessment.get("rubricId") not in rubric_set:
            errors.append(
                f"Node {node.get('id')} references unknown rubric {assessment.get('rubricId')}"
            )

    adjacency: dict[str, list[str]] = {node_id: [] for node_id in node_set}
    for edge in edges:
        from_id = edge.get("fromNodeId")
        to_id = edge.get("toNodeId")
        if from_id not in node_set or to_id not in node_set:
            errors.append(f"Edge references unknown node: {from_id} -> {to_id}")
            continue
        adjacency[str(from_id)].append(str(to_id))

    visiting: set[str] = set()
    visited: set[str] = set()

    def visit(node_id: str) -> bool:
        if node_id in visiting:
            return True
        if node_id in visited:
            return False
        visiting.add(node_id)
        for next_id in adjacency.get(node_id, []):
            if visit(next_id):
                return True
        visiting.remove(node_id)
        visited.add(node_id)
        return False

    if any(visit(node_id) for node_id in sorted(node_set)):
        errors.append("Module graph edges contain a cycle")

    if "concept" not in node_types:
        errors.append("Module graph must contain a concept node")
    if not ({"retrieval", "quiz"} & node_types):
        errors.append("Module graph must contain a retrieval or quiz node")
    if not ({"transfer", "reorder"} & node_types):
        errors.append("Module graph must contain a transfer or reorder node")
    if "boss_proof" not in node_types:
        errors.append("Module graph must contain a boss_proof node")

    if generate_input is not None:
        evidence = generate_input.get("evidenceBundle") or []
        evidence_source_ids = {str(item.get("sourceId")) for item in evidence}
        outside_sources = sorted(source_set - evidence_source_ids)
        if outside_sources:
            errors.append(
                "Graph sources outside evidence bundle: " + ", ".join(outside_sources)
            )
        evidence_artifact_ids = {
            str(item.get("artifactId"))
            for item in evidence
            if item.get("artifactId")
        }
        provenance_artifacts = set(
            (graph.get("provenance") or {}).get("sourceArtifactIds") or []
        )
        outside_artifacts = sorted(provenance_artifacts - evidence_artifact_ids)
        if outside_artifacts:
            errors.append(
                "Graph provenance artifacts outside evidence bundle: "
                + ", ".join(outside_artifacts)
            )

    return errors


def validate_topic_output_semantics(output: dict[str, Any]) -> None:
    decision = output.get("decision")
    questions = output.get("clarificationQuestions") or []
    if decision == "clarify" and not questions:
        raise ContractValidationError(
            "A clarify decision must include at least one clarification question."
        )
    if decision in {"allow", "block"} and questions:
        raise ContractValidationError(
            "Allow/block decisions must not include clarification questions."
        )


def validate_generate_output_semantics(
    catalog: ContractCatalog,
    output: dict[str, Any],
    generate_input: dict[str, Any],
) -> None:
    catalog.validate("generate_output", output)
    graph = output.get("moduleGraph")
    catalog.validate_module_graph(graph)
    expected_hash = stable_sha256(generate_input.get("evidenceBundle") or [])
    actual_hash = (output.get("generation") or {}).get("evidenceBundleHash")
    errors = _semantic_errors_for_graph(graph, generate_input)
    if actual_hash != expected_hash:
        errors.append("generation.evidenceBundleHash does not match the evidence bundle")
    if errors:
        raise ContractValidationError(
            "Module graph failed GON semantic validation.", errors[:30]
        )


def validate_assess_output_semantics(
    output: dict[str, Any], assess_input: dict[str, Any]
) -> None:
    rubric = assess_input.get("rubric") or {}
    rubric_criteria = rubric.get("criteria") or []
    expected_ids = [str(item.get("id")) for item in rubric_criteria]
    actual = output.get("criteria") or []
    actual_ids = [str(item.get("criterionId")) for item in actual]
    errors: list[str] = []

    if _duplicates(actual_ids):
        errors.append("Assessment output contains duplicate criterion IDs")
    if set(actual_ids) != set(expected_ids):
        errors.append("Assessment output criteria must exactly match the rubric criteria")

    if output.get("decision") == "passed" and not errors:
        by_id = {str(item.get("criterionId")): bool(item.get("passed")) for item in actual}
        pass_rule = rubric.get("passRule") or {}
        if pass_rule.get("type") == "all_required":
            failed_required = [
                str(item.get("id"))
                for item in rubric_criteria
                if item.get("required") and not by_id.get(str(item.get("id")), False)
            ]
            if failed_required:
                errors.append(
                    "Decision passed violates all_required rubric: "
                    + ", ".join(failed_required)
                )
        elif pass_rule.get("type") == "weighted_threshold":
            total_weight = sum(float(item.get("weight") or 0) for item in rubric_criteria)
            passed_weight = sum(
                float(item.get("weight") or 0)
                for item in rubric_criteria
                if by_id.get(str(item.get("id")), False)
            )
            threshold = float(pass_rule.get("threshold") or 0)
            normalized = passed_weight / total_weight if total_weight else 0
            if normalized < threshold:
                errors.append("Decision passed violates weighted_threshold rubric")
            failed_required = [
                str(item.get("id"))
                for item in rubric_criteria
                if item.get("required") and not by_id.get(str(item.get("id")), False)
            ]
            if failed_required:
                errors.append(
                    "Decision passed despite failed required criteria: "
                    + ", ".join(failed_required)
                )

    if errors:
        raise ContractValidationError(
            "Assessment output failed GON semantic validation.", errors
        )
