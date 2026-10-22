#!/usr/bin/env python3
"""
Validate the GON P03 machine-readable contracts.

Requirements (install in a virtualenv or CI):
    python -m pip install jsonschema openapi-spec-validator

Exit codes:
    0 = valid
    1 = contract validation failure
    2 = missing validation dependency
"""

from __future__ import annotations

import copy
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMAS = ROOT / "schemas"
EXAMPLES = ROOT / "examples"
OPENAPI = ROOT / "openapi.json"
FIXTURES = ROOT / "fixtures" / "mock-api-responses.json"


def load(path: Path):
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    try:
        from jsonschema import Draft202012Validator, FormatChecker
        from openapi_spec_validator import validate as validate_openapi_spec
        from referencing import Registry, Resource
    except ImportError as exc:  # pragma: no cover - environment guard
        print(
            "Missing dependency: install jsonschema and openapi-spec-validator "
            "in a virtualenv or CI before running this validator.",
            file=sys.stderr,
        )
        print(f"Import error: {exc}", file=sys.stderr)
        return 2

    errors: list[str] = []

    schema_docs = {
        "module_graph": load(SCHEMAS / "canonical-module-graph.schema.json"),
        "domain_event": load(SCHEMAS / "domain-event-envelope.schema.json"),
        "job_command": load(SCHEMAS / "job-command.schema.json"),
        "agent": load(SCHEMAS / "agent-contracts.schema.json"),
        "game_event": load(SCHEMAS / "game-event.schema.json"),
    }
    openapi = load(OPENAPI)
    fixtures = load(FIXTURES)

    # 1. Every JSON Schema must itself be a valid Draft 2020-12 schema.
    for name, schema in schema_docs.items():
        try:
            Draft202012Validator.check_schema(schema)
        except Exception as exc:  # noqa: BLE001 - collect all failures
            errors.append(f"Schema {name} is invalid: {exc}")

    # 2. OpenAPI structure and key GON invariants.
    try:
        validate_openapi_spec(openapi, base_uri=OPENAPI.resolve().as_uri())
    except Exception as exc:  # noqa: BLE001 - collect all failures
        errors.append(f"OpenAPI is invalid: {exc}")

    operation_ids: list[str] = []
    covered_screens: set[str] = set()
    for path, methods in openapi.get("paths", {}).items():
        for method, operation in methods.items():
            label = f"{method.upper()} {path}"
            operation_id = operation.get("operationId")
            if not operation_id:
                errors.append(f"{label} is missing operationId")
            else:
                operation_ids.append(operation_id)
            screens = operation.get("x-gon-screens")
            if not screens:
                errors.append(f"{label} is missing x-gon-screens")
            else:
                covered_screens.update(screens)
            if not operation.get("x-gon-requirements"):
                errors.append(f"{label} is missing x-gon-requirements")

    duplicates = sorted(
        operation_id
        for operation_id in set(operation_ids)
        if operation_ids.count(operation_id) > 1
    )
    if duplicates:
        errors.append(f"Duplicate OpenAPI operationIds: {duplicates}")

    expected_screens = {f"SCR-{number:02d}" for number in range(1, 18)}
    if covered_screens != expected_screens:
        errors.append(
            "OpenAPI must cover exactly SCR-01…SCR-17; "
            f"missing={sorted(expected_screens - covered_screens)}, "
            f"unknown={sorted(covered_screens - expected_screens)}"
        )

    schemas_text = json.dumps(openapi.get("components", {}).get("schemas", {}))
    for forbidden in ("embedding", "vector[", "cosineDistance", "rawPrompt"):
        if forbidden.lower() in schemas_text.lower():
            errors.append(f"OpenAPI appears to expose forbidden internal field: {forbidden}")

    progress = openapi["components"]["schemas"].get("ProgressSummary", {})
    formula = (
        progress.get("properties", {})
        .get("formulaVersion", {})
        .get("const")
    )
    if formula != "gon-level-v1":
        errors.append("ProgressSummary must pin formulaVersion to gon-level-v1")

    # 3. Validate examples. The agent contract references the canonical
    # module graph by its absolute $id, so register it explicitly.
    registry = Registry().with_resources(
        [
            (
                schema_docs["module_graph"]["$id"],
                Resource.from_contents(schema_docs["module_graph"]),
            ),
            (
                schema_docs["game_event"]["$id"],
                Resource.from_contents(schema_docs["game_event"]),
            ),
        ]
    )
    format_checker = FormatChecker()

    def validate(schema, instance, label: str) -> None:
        validator = Draft202012Validator(
            schema,
            registry=registry,
            format_checker=format_checker,
        )
        for error in sorted(validator.iter_errors(instance), key=str):
            location = "/".join(str(part) for part in error.absolute_path)
            errors.append(f"{label} at {location or '<root>'}: {error.message}")

    module_graph = load(EXAMPLES / "module-graph-viral-music.json")
    validate(schema_docs["module_graph"], module_graph, "module-graph example")
    validate(
        schema_docs["domain_event"],
        load(EXAMPLES / "domain-event-xp-posted.json"),
        "domain-event example",
    )
    validate(
        schema_docs["job_command"],
        load(EXAMPLES / "job-brew-command.json"),
        "job-command example",
    )
    validate(
        schema_docs["game_event"],
        load(EXAMPLES / "game-events.json"),
        "game-event example",
    )

    agent = schema_docs["agent"]
    agent_cases = [
        ("TopicCheckInput", "agent-topic-check-input.json"),
        ("TopicCheckOutput", "agent-topic-check-output.json"),
        ("GenerateModuleInput", "agent-generate-input.json"),
        ("GenerateModuleOutput", "agent-generate-output.json"),
        ("AssessAttemptInput", "agent-assess-input.json"),
        ("AssessAttemptOutput", "agent-assess-output.json"),
    ]
    for definition, filename in agent_cases:
        validate(
            agent["$defs"][definition],
            load(EXAMPLES / filename),
            f"agent {definition} example",
        )

    # 4. Cross-reference checks JSON Schema cannot express.
    concept_ids = {concept["id"] for concept in module_graph["module"]["concepts"]}
    source_ids = {source["id"] for source in module_graph["sources"]}
    node_ids = [node["id"] for node in module_graph["nodes"]]
    node_id_set = set(node_ids)
    rubric_ids = {rubric["id"] for rubric in module_graph["rubrics"]}

    if len(node_ids) != len(node_id_set):
        errors.append("Module graph example has duplicate node IDs")

    for outcome in module_graph["module"]["outcomes"]:
        unknown = set(outcome["conceptIds"]) - concept_ids
        if unknown:
            errors.append(f"Outcome {outcome['id']} references unknown concepts: {unknown}")

    for node in module_graph["nodes"]:
        unknown_concepts = set(node["conceptIds"]) - concept_ids
        if unknown_concepts:
            errors.append(f"Node {node['id']} references unknown concepts: {unknown_concepts}")
        for citation in node["citations"]:
            if citation["sourceId"] not in source_ids:
                errors.append(f"Node {node['id']} cites unknown source {citation['sourceId']}")
        assessment = node.get("assessment")
        if assessment and assessment["rubricId"] not in rubric_ids:
            errors.append(f"Node {node['id']} references unknown rubric {assessment['rubricId']}")

    for edge in module_graph["edges"]:
        if edge["fromNodeId"] not in node_id_set or edge["toNodeId"] not in node_id_set:
            errors.append(f"Edge references unknown node: {edge}")

    required_node_types = {"concept", "retrieval", "transfer", "boss_proof"}
    present_node_types = {node["type"] for node in module_graph["nodes"]}
    if not required_node_types.issubset(present_node_types):
        errors.append("Standard module example must include concept, retrieval, transfer and boss_proof")

    # 5. Mock API fixtures must satisfy the public OpenAPI component schemas.
    # OpenAPI-internal pointers are rewritten to JSON Schema $defs pointers so
    # the aggregate schemas can be exercised without a running server.
    def rewrite_openapi_refs(value):
        if isinstance(value, dict):
            rewritten = {}
            for key, item in value.items():
                if key == "$ref" and isinstance(item, str):
                    if item.startswith("#/components/schemas/"):
                        rewritten[key] = "#/$defs/" + item.rsplit("/", 1)[1]
                    elif item == "./schemas/canonical-module-graph.schema.json":
                        rewritten[key] = schema_docs["module_graph"]["$id"]
                    elif item == "./schemas/game-event.schema.json":
                        rewritten[key] = schema_docs["game_event"]["$id"]
                    else:
                        rewritten[key] = item
                else:
                    rewritten[key] = rewrite_openapi_refs(item)
            return rewritten
        if isinstance(value, list):
            return [rewrite_openapi_refs(item) for item in value]
        return value

    openapi_defs = rewrite_openapi_refs(
        copy.deepcopy(openapi["components"]["schemas"])
    )
    fixture_cases = {
        "bootstrap": "Bootstrap",
        "workspace": "ProjectWorkspace",
        "outputExplorer": "OutputExplorer",
        "arenaBlind": "ArenaMatch",
        "journeyPlayer": "JourneyPlayer",
        "progress": "ProgressSummary",
    }
    for fixture_key, schema_name in fixture_cases.items():
        validate(
            {"$ref": f"#/$defs/{schema_name}", "$defs": openapi_defs},
            fixtures[fixture_key]["data"],
            f"mock fixture {fixture_key} ({schema_name})",
        )

    # The player fixture embeds a learner-safe projection, not the stored
    # canonical graph. It must remain schema-valid while hiding answers that
    # would let a learner bypass retrieval before submitting an attempt.
    def collect_keys(value):
        if isinstance(value, dict):
            keys = set(value)
            for item in value.values():
                keys.update(collect_keys(item))
            return keys
        if isinstance(value, list):
            keys = set()
            for item in value:
                keys.update(collect_keys(item))
            return keys
        return set()

    player_graph = fixtures["journeyPlayer"]["data"].get("playerGraph", {})
    forbidden_player_keys = {
        "sampleAnswer",
        "correctChoiceIds",
        "internalScoringNotes",
    }
    leaked_keys = sorted(
        forbidden_player_keys.intersection(collect_keys(player_graph))
    )
    if leaked_keys:
        errors.append(
            f"JourneyPlayer fixture leaks hidden answer fields: {leaked_keys}"
        )

    output_fixture = fixtures["outputExplorer"]["data"]
    candidate_ids = [
        candidate["id"] for candidate in output_fixture["candidates"]
    ]
    if output_fixture["candidateSet"]["actualCount"] != len(candidate_ids):
        errors.append("Output Explorer fixture actualCount must match candidates length")
    if output_fixture["rankingSnapshot"]["orderedCandidateIds"] != candidate_ids:
        errors.append("Output Explorer fixture ranking order must match candidate order")

    # 6. Lifelong level fixture arithmetic.
    progress_fixture = fixtures["bootstrap"]["data"]["progress"]
    lifetime_xp = progress_fixture["lifetimeXp"]
    if progress_fixture["numericLevel"] != lifetime_xp // 100:
        errors.append("Fixture numericLevel must equal floor(lifetimeXp / 100)")
    if progress_fixture["xpInLevel"] != lifetime_xp % 100:
        errors.append("Fixture xpInLevel must equal lifetimeXp modulo 100")

    # 7. Traceability coverage: ranges alone are not enough; every approved
    # P01 requirement ID must appear explicitly in the P03 matrix.
    prd_path = ROOT.parent / "02-requirements" / "GON-PRD-V1.md"
    matrix_path = ROOT / "P03-TRACEABILITY-MATRIX.md"
    if not prd_path.exists() or not matrix_path.exists():
        errors.append("P01 PRD or P03 traceability matrix is missing")
    else:
        prd_text = prd_path.read_text(encoding="utf-8")
        matrix_text = matrix_path.read_text(encoding="utf-8")
        expected_requirements = set(
            re.findall(r"REQ-[A-Z]+-\d{3}", prd_text)
        )
        traced_requirements = set(
            re.findall(r"REQ-[A-Z]+-\d{3}", matrix_text)
        )
        missing_requirements = sorted(
            expected_requirements - traced_requirements
        )
        if missing_requirements:
            errors.append(
                "P03 traceability is missing requirements: "
                f"{missing_requirements}"
            )

        expected_groups = {
            "BDD": {f"BDD-{number:02d}" for number in range(1, 23)},
            "SCR": {f"SCR-{number:02d}" for number in range(1, 18)},
            "Q-P03": {f"Q-P03-{number:02d}" for number in range(1, 15)},
            "D-P03": {f"D-P03-{number:02d}" for number in range(1, 15)},
        }
        patterns = {
            "BDD": r"BDD-\d{2}",
            "SCR": r"SCR-\d{2}",
            "Q-P03": r"Q-P03-\d{2}",
            "D-P03": r"D-P03-\d{2}",
        }
        for group, expected in expected_groups.items():
            found = set(re.findall(patterns[group], matrix_text))
            missing = sorted(expected - found)
            if missing:
                errors.append(
                    f"P03 traceability is missing {group} IDs: {missing}"
                )

    if errors:
        print("P03 contract validation failed:\n", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    operation_count = sum(len(methods) for methods in openapi["paths"].values())
    print(
        "P03 contracts valid: "
        f"{len(openapi['paths'])} paths, {operation_count} operations, "
        f"{len(schema_docs)} JSON schemas, examples and fixtures checked."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
