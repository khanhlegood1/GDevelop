from __future__ import annotations

import math
import re
from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any

from .contracts import ContractValidationError, stable_sha256

PIPELINE_VERSION = "gon-adk-local-deterministic/0.1.0"

_BLOCK_PHRASES = (
    "chế tạo bom",
    "làm vũ khí",
    "make a bomb",
    "build a weapon",
    "hack tài khoản",
    "đánh cắp mật khẩu",
)


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


class LocalDeterministicProvider:
    """Offline contract provider.

    This is deliberately not an LLM and must never be presented as Gemini or
    as the production Brew/assessment quality path. It exists so P04 can test
    the TypeScript/Python boundary, JSON Schemas, citation allowlists and
    fail-closed behavior before real credentials are available.
    """

    name = "local-deterministic-provider-v1"

    async def topic_check(self, payload: dict[str, Any]) -> dict[str, Any]:
        intent = str(payload.get("intent") or "")
        normalized = _normalize(intent)
        if any(phrase in normalized for phrase in _BLOCK_PHRASES):
            return {
                "schemaVersion": "gon.agent.topic-check.output/1.0",
                "decision": "block",
                "reasonCodes": ["unsafe_operational_request"],
                "clarificationQuestions": [],
            }

        words = [word for word in re.split(r"\s+", normalized) if word]
        coverage = payload.get("artifactCoverage") or []
        has_usable_evidence = any(
            item.get("hasText") or item.get("hasMetadata") for item in coverage
        )
        if len(words) < 4:
            return {
                "schemaVersion": "gon.agent.topic-check.output/1.0",
                "decision": "clarify",
                "reasonCodes": ["intent_too_underspecified"],
                "clarificationQuestions": [
                    "Bạn muốn giải thích, áp dụng hay tạo artifact từ chủ đề này?",
                    "Kết quả học cụ thể bạn muốn đạt được là gì?",
                ],
            }
        if coverage and not has_usable_evidence:
            return {
                "schemaVersion": "gon.agent.topic-check.output/1.0",
                "decision": "clarify",
                "reasonCodes": ["no_usable_artifact_coverage"],
                "clarificationQuestions": [
                    "Bạn có thể bổ sung text/nguồn có nội dung trích xuất được không?"
                ],
            }

        return {
            "schemaVersion": "gon.agent.topic-check.output/1.0",
            "decision": "allow",
            "reasonCodes": [
                "clear_learning_intent",
                "local_deterministic_check_only",
            ],
            "clarificationQuestions": [],
        }

    async def generate_module(self, payload: dict[str, Any]) -> dict[str, Any]:
        evidence = payload.get("evidenceBundle") or []
        context = payload.get("learningContext") or {}
        locale = str(context.get("locale") or "vi-VN")
        goal = str(context.get("goal") or "Mục tiêu học")
        time_budget = int(context.get("timeBudgetMinutes") or 30)
        concept_minutes = max(5, math.ceil(time_budget * 0.3))
        retrieval_minutes = max(3, math.ceil(time_budget * 0.17))
        transfer_minutes = max(5, math.ceil(time_budget * 0.23))
        boss_minutes = max(
            5,
            time_budget - concept_minutes - retrieval_minutes - transfer_minutes,
        )
        total_minutes = (
            concept_minutes + retrieval_minutes + transfer_minutes + boss_minutes
        )

        sources: list[dict[str, Any]] = []
        citations: list[dict[str, Any]] = []
        blocks: list[dict[str, Any]] = [
            {
                "kind": "paragraph",
                "text": (
                    "Module local này tổ chức bằng chứng đã được GON đưa vào evidence "
                    "bundle. Hãy tách điều nguồn thực sự hỗ trợ khỏi diễn giải và giới hạn."
                ),
            }
        ]

        allowed_rights = {
            "user_provided",
            "link_only",
            "licensed",
            "public_reference",
            "unknown",
        }
        for index, item in enumerate(evidence):
            source_id = str(item.get("sourceId"))
            uri = item.get("uri")
            artifact_id = item.get("artifactId")
            if not uri and not artifact_id:
                raise ContractValidationError(
                    "Evidence source cannot become a graph source without URI or artifactId.",
                    [source_id],
                )
            kind = "user_artifact" if artifact_id else "external_web"
            if uri and any(host in str(uri) for host in ("youtube.", "facebook.")):
                kind = "external_video"
            rights = str(item.get("rightsStatus") or "unknown")
            source: dict[str, Any] = {
                "id": source_id,
                "kind": kind,
                "title": str(item.get("title") or source_id)[:300],
                "rightsStatus": rights if rights in allowed_rights else "unknown",
                "locators": [
                    {
                        "type": "url_fragment" if uri else "span",
                        "value": (str(uri)[-300:] if uri else "artifact-content"),
                    }
                ],
            }
            if uri:
                source["uri"] = str(uri)
                source["retrievedAt"] = datetime.now(timezone.utc).isoformat().replace(
                    "+00:00", "Z"
                )
            if artifact_id:
                source["artifactId"] = str(artifact_id)
            sources.append(source)
            citations.append(
                {
                    "sourceId": source_id,
                    "support": "supports" if index == 0 else "background",
                    "claimIds": ["claim_evidence_bundle"],
                }
            )
            excerpt = re.sub(r"\s+", " ", str(item.get("content") or "")).strip()
            if excerpt:
                blocks.append(
                    {
                        "kind": "source_excerpt",
                        "text": excerpt[:700],
                    }
                )

        graph = {
            "schemaVersion": "gon.module-graph/1.0",
            "module": {
                "title": goal[:180],
                "summary": (
                    "Bản nháp local deterministic: đọc bằng chứng, truy hồi giá trị cốt lõi, "
                    "chuyển giao sang bối cảnh mới và tạo Boss Proof có thể kiểm tra."
                ),
                "locale": locale,
                "estimatedMinutes": total_minutes,
                "difficulty": "beginner"
                if context.get("depth") == "intro"
                else "intermediate",
                "outcomes": [
                    {
                        "id": "outcome_explain",
                        "statement": "Giải thích được giá trị cốt lõi bằng lời của mình và nêu giới hạn bằng chứng.",
                        "conceptIds": ["core_value", "evidence_and_limits"],
                    },
                    {
                        "id": "outcome_apply",
                        "statement": "Áp dụng được ý tưởng vào một bối cảnh mới và biết cách đo kết quả.",
                        "conceptIds": ["transfer_context"],
                    },
                    {
                        "id": "outcome_create",
                        "statement": "Tạo được artifact học tập có mục tiêu, nội dung và cách kiểm tra rõ ràng.",
                        "conceptIds": ["artifact_creation"],
                    },
                ],
                "concepts": [
                    {
                        "id": "core_value",
                        "name": "Giá trị cốt lõi",
                        "description": "Ý tưởng trung tâm cần hiểu thay vì sao chép bề mặt.",
                        "role": "core",
                    },
                    {
                        "id": "evidence_and_limits",
                        "name": "Bằng chứng và giới hạn",
                        "description": "Điều nguồn hỗ trợ và điều chưa đủ căn cứ để kết luận.",
                        "role": "core",
                    },
                    {
                        "id": "transfer_context",
                        "name": "Chuyển giao bối cảnh",
                        "description": "Áp dụng nguyên lý vào tình huống khác với ví dụ nguồn.",
                        "role": "core",
                    },
                    {
                        "id": "artifact_creation",
                        "name": "Tạo artifact dạy lại",
                        "description": "Biến hiểu biết thành sản phẩm người khác có thể dùng và kiểm tra.",
                        "role": "supporting",
                    },
                ],
                "prerequisites": [],
                "safetyNotices": [
                    "Đây là bản nháp AI/local cần kiểm chứng nguồn trước khi dùng cho quyết định quan trọng."
                ],
            },
            "sources": sources,
            "nodes": [
                {
                    "id": "concept_core",
                    "type": "concept",
                    "title": "Đọc bằng chứng và tách giá trị cốt lõi",
                    "conceptIds": ["core_value", "evidence_and_limits"],
                    "content": {"blocks": blocks},
                    "citations": citations,
                    "estimatedMinutes": concept_minutes,
                    "accessibility": {
                        "textAlternative": "Toàn bộ node có dạng văn bản.",
                        "keyboardEquivalent": True,
                    },
                },
                {
                    "id": "retrieval_core",
                    "type": "retrieval",
                    "title": "Giải thích bằng lời của bạn",
                    "conceptIds": ["core_value", "evidence_and_limits"],
                    "content": {
                        "prompt": "Không nhìn lại nguyên văn, hãy giải thích giá trị cốt lõi, bằng chứng hỗ trợ và một giới hạn quan trọng.",
                        "sampleAnswer": "Một đáp án đạt cần nêu giá trị cốt lõi bằng lời của người học, chỉ rõ nguồn là bằng chứng khởi điểm và thừa nhận giới hạn cần kiểm chứng thêm.",
                    },
                    "citations": [],
                    "estimatedMinutes": retrieval_minutes,
                    "accessibility": {
                        "textAlternative": "Câu hỏi truy hồi dạng văn bản.",
                        "keyboardEquivalent": True,
                    },
                    "assessment": {
                        "rubricId": "rubric_retrieval",
                        "masteryTarget": "recall",
                        "revealPolicy": "after_submit",
                        "requiredForCompletion": True,
                    },
                },
                {
                    "id": "transfer_new_context",
                    "type": "transfer",
                    "title": "Áp dụng sang bối cảnh mới",
                    "conceptIds": ["transfer_context", "evidence_and_limits"],
                    "content": {
                        "prompt": "Chọn một bối cảnh mới, mô tả cách áp dụng cụ thể và cách đo kết quả học thật thay vì chỉ đo lượt xem.",
                    },
                    "citations": [],
                    "estimatedMinutes": transfer_minutes,
                    "accessibility": {
                        "textAlternative": "Nhiệm vụ chuyển giao dạng văn bản.",
                        "keyboardEquivalent": True,
                    },
                    "assessment": {
                        "rubricId": "rubric_transfer",
                        "masteryTarget": "apply",
                        "revealPolicy": "after_submit",
                        "requiredForCompletion": True,
                    },
                },
                {
                    "id": "boss_artifact",
                    "type": "boss_proof",
                    "title": "Boss Proof: tạo artifact dạy lại",
                    "conceptIds": ["artifact_creation", "core_value"],
                    "content": {
                        "prompt": "Tạo hoặc mô tả một artifact dạy lại hoàn chỉnh: mục tiêu học, giá trị cốt lõi, nội dung artifact và cách người khác sử dụng/kiểm tra.",
                    },
                    "citations": [],
                    "estimatedMinutes": boss_minutes,
                    "accessibility": {
                        "textAlternative": "Boss Proof có thể nộp bằng mô tả văn bản đầy đủ.",
                        "keyboardEquivalent": True,
                    },
                    "assessment": {
                        "rubricId": "rubric_boss",
                        "masteryTarget": "create",
                        "revealPolicy": "after_submit",
                        "requiredForCompletion": True,
                    },
                },
            ],
            "edges": [
                {"fromNodeId": "concept_core", "toNodeId": "retrieval_core", "type": "prerequisite"},
                {"fromNodeId": "retrieval_core", "toNodeId": "transfer_new_context", "type": "prerequisite"},
                {"fromNodeId": "transfer_new_context", "toNodeId": "boss_artifact", "type": "prerequisite"},
            ],
            "rubrics": [
                {
                    "id": "rubric_retrieval",
                    "version": "1.0",
                    "title": "Truy hồi giá trị cốt lõi và giới hạn",
                    "criteria": [
                        {
                            "id": "core_value_explained",
                            "description": "Giải thích được giá trị/ý tưởng cốt lõi bằng lời của người học.",
                            "weight": 0.6,
                            "required": True,
                        },
                        {
                            "id": "evidence_and_limit",
                            "description": "Nêu bằng chứng/nguồn hỗ trợ và giới hạn cần kiểm chứng.",
                            "weight": 0.4,
                            "required": True,
                        },
                    ],
                    "passRule": {"type": "all_required"},
                    "evidenceTypes": ["text"],
                    "feedbackGuidance": "Chỉ rõ phần cốt lõi hoặc giới hạn còn thiếu.",
                    "xpRuleId": "xp.retrieval_pass.v1",
                },
                {
                    "id": "rubric_transfer",
                    "version": "1.0",
                    "title": "Chuyển giao sang bối cảnh mới",
                    "criteria": [
                        {
                            "id": "new_context_named",
                            "description": "Nêu bối cảnh/ngách mới khác ví dụ nguồn.",
                            "weight": 0.3,
                            "required": True,
                        },
                        {
                            "id": "application_steps",
                            "description": "Mô tả cách áp dụng cụ thể, không chỉ nhắc lại lý thuyết.",
                            "weight": 0.4,
                            "required": True,
                        },
                        {
                            "id": "result_measurement",
                            "description": "Nêu cách đo kết quả học/hiệu quả có thể quan sát.",
                            "weight": 0.3,
                            "required": True,
                        },
                    ],
                    "passRule": {"type": "all_required"},
                    "evidenceTypes": ["text", "artifact"],
                    "feedbackGuidance": "Gợi ý bổ sung bối cảnh, bước áp dụng hoặc thước đo còn thiếu.",
                    "xpRuleId": "xp.transfer_pass.v1",
                },
                {
                    "id": "rubric_boss",
                    "version": "1.0",
                    "title": "Boss Proof artifact dạy lại",
                    "criteria": [
                        {
                            "id": "learning_goal_clear",
                            "description": "Artifact có mục tiêu học quan sát được.",
                            "weight": 0.3,
                            "required": True,
                        },
                        {
                            "id": "artifact_complete",
                            "description": "Nội dung artifact đủ hoàn chỉnh để người khác học được giá trị cốt lõi.",
                            "weight": 0.4,
                            "required": True,
                        },
                        {
                            "id": "usable_or_checkable",
                            "description": "Nêu cách người khác sử dụng hoặc kiểm tra artifact.",
                            "weight": 0.3,
                            "required": True,
                        },
                    ],
                    "passRule": {"type": "all_required"},
                    "evidenceTypes": ["text", "artifact", "teach_back"],
                    "feedbackGuidance": "Không kết luận gian lận chỉ từ tương đồng; chỉ rõ tiêu chí artifact còn thiếu.",
                    "xpRuleId": "xp.boss_pass.v1",
                },
            ],
            "renderTargets": ["web", "infographic", "easy_task", "teach_back"],
            "provenance": {
                "createdByType": "ai_assisted",
                "createdByUserId": None,
                "sourceArtifactIds": [
                    str(item["artifactId"])
                    for item in evidence
                    if item.get("artifactId")
                ],
                "generation": {
                    "brewJobId": str(payload.get("jobId")),
                    "agentPipelineVersion": PIPELINE_VERSION,
                    "modelIds": [],
                    "promptTemplateVersions": [],
                },
                "attribution": {
                    "displayName": "GON local deterministic contract provider",
                    "upstreamModuleVersionId": None,
                },
            },
            "quality": {"citationCoverage": 1, "unverifiedClaimIds": []},
        }

        return {
            "schemaVersion": "gon.agent.generate-module.output/1.0",
            "moduleGraph": graph,
            "generation": {
                "agentPipelineVersion": PIPELINE_VERSION,
                "modelIds": [],
                "promptTemplateVersions": [],
                "evidenceBundleHash": stable_sha256(evidence),
            },
        }

    async def assess_attempt(self, payload: dict[str, Any]) -> dict[str, Any]:
        rubric = payload.get("rubric") or {}
        criteria = rubric.get("criteria") or []
        answer = payload.get("answer") or {}
        text = " ".join(
            [str(answer.get("text") or "")]
            + [str(item) for item in answer.get("artifactSummaries") or []]
        ).strip()
        normalized = _normalize(text)
        sample = _normalize(
            str(((payload.get("node") or {}).get("content") or {}).get("sampleAnswer") or "")
        )

        if len(text) < 40:
            results = [
                {
                    "criterionId": str(item.get("id")),
                    "passed": False,
                    "feedback": "Bài làm quá ngắn để chứng minh tiêu chí này.",
                }
                for item in criteria
            ]
            return {
                "schemaVersion": "gon.agent.assess-attempt.output/1.0",
                "decision": "needs_revision",
                "criteria": results,
                "feedback": "Hãy bổ sung giải thích cụ thể theo từng tiêu chí trong rubric.",
                "confidence": 0.95,
                "integritySignals": ["low_information_answer"],
            }

        similarity = (
            SequenceMatcher(None, normalized, sample).ratio() if sample else 0.0
        )
        if similarity >= 0.82:
            results = [
                {
                    "criterionId": str(item.get("id")),
                    "passed": False,
                    "feedback": "Cần human review vì bài làm rất gần đáp án mẫu/nguồn; đây không phải kết luận gian lận.",
                }
                for item in criteria
            ]
            return {
                "schemaVersion": "gon.agent.assess-attempt.output/1.0",
                "decision": "pending_human_review",
                "criteria": results,
                "feedback": "Hệ thống chưa ghi XP cho attempt này và chuyển sang human review.",
                "confidence": 0.6,
                "integritySignals": ["high_similarity_to_source_or_sample"],
            }

        results: list[dict[str, Any]] = []
        unknown = False
        for item in criteria:
            criterion_id = str(item.get("id"))
            passed, known = self._criterion_passed(criterion_id, normalized)
            unknown = unknown or not known
            results.append(
                {
                    "criterionId": criterion_id,
                    "passed": bool(passed and known),
                    "feedback": (
                        "Đã có bằng chứng theo tiêu chí."
                        if passed and known
                        else "Local deterministic provider chưa có căn cứ đủ rõ cho tiêu chí này."
                        if not known
                        else "Chưa thấy bằng chứng đủ rõ cho tiêu chí này."
                    ),
                }
            )

        if unknown:
            return {
                "schemaVersion": "gon.agent.assess-attempt.output/1.0",
                "decision": "pending_human_review",
                "criteria": results,
                "feedback": "Ít nhất một tiêu chí cần đánh giá ngữ nghĩa bởi AI/human reviewer; local provider không tự kết luận đạt.",
                "confidence": 0.55,
                "integritySignals": ["deterministic_rubric_insufficient"],
            }

        decision = (
            "passed"
            if self._rubric_passed(rubric, results)
            else "needs_revision"
        )
        return {
            "schemaVersion": "gon.agent.assess-attempt.output/1.0",
            "decision": decision,
            "criteria": results,
            "feedback": (
                "Bài làm đạt các tiêu chí deterministic đã công bố."
                if decision == "passed"
                else "Hãy sửa các tiêu chí chưa đạt rồi tạo attempt mới."
            ),
            "confidence": 0.9,
            "integritySignals": [],
        }

    @staticmethod
    def _criterion_passed(criterion_id: str, normalized: str) -> tuple[bool, bool]:
        rules: dict[str, tuple[str, ...]] = {
            "core_value_explained": ("giá trị cốt lõi", "ý tưởng cốt lõi", "cơ chế"),
            "evidence_and_limit": ("bằng chứng", "nguồn", "giới hạn"),
            "new_context_named": ("bối cảnh mới", "áp dụng cho", "ngách"),
            "application_steps": ("cách áp dụng", "bước", "sẽ mở bằng", "triển khai"),
            "result_measurement": ("cách đo", "đo kết quả", "tỉ lệ", "số người hoàn thành"),
            "learning_goal_clear": ("mục tiêu học", "mục tiêu:"),
            "artifact_complete": ("nội dung artifact", "infographic", "artifact gồm", "bài học gồm"),
            "usable_or_checkable": ("sử dụng", "kiểm tra", "đối chiếu"),
            "own_words": ("bằng lời", "theo cách hiểu", "tôi hiểu"),
        }
        if criterion_id == "two_factor_groups":
            groups = [
                any(term in normalized for term in ("cộng đồng", "mạng lưới", "người chia sẻ")),
                any(term in normalized for term in ("thời điểm", "bối cảnh", "văn hóa")),
                "remix" in normalized,
                "hook" in normalized,
            ]
            return sum(groups) >= 2, True
        phrases = rules.get(criterion_id)
        if phrases is None:
            return False, False
        if criterion_id == "evidence_and_limit":
            return ("bằng chứng" in normalized or "nguồn" in normalized) and (
                "giới hạn" in normalized or "chưa đủ" in normalized
            ), True
        return any(phrase in normalized for phrase in phrases), True

    @staticmethod
    def _rubric_passed(
        rubric: dict[str, Any], results: list[dict[str, Any]]
    ) -> bool:
        criteria = rubric.get("criteria") or []
        by_id = {item["criterionId"]: bool(item["passed"]) for item in results}
        if any(
            item.get("required") and not by_id.get(str(item.get("id")), False)
            for item in criteria
        ):
            return False
        rule = rubric.get("passRule") or {}
        if rule.get("type") == "weighted_threshold":
            total = sum(float(item.get("weight") or 0) for item in criteria)
            passed = sum(
                float(item.get("weight") or 0)
                for item in criteria
                if by_id.get(str(item.get("id")), False)
            )
            return bool(total and passed / total >= float(rule.get("threshold") or 0))
        return True
