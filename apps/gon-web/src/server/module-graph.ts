import Ajv2020, { type ValidateFunction } from "ajv/dist/2020";
import addFormats from "ajv-formats";
import moduleGraphSchema from "../../docs/04-contracts/schemas/canonical-module-graph.schema.json";
import { stableHash } from "./hash";
import { slugifyAscii, truncateText } from "./text";
import type { ModuleGraph } from "./types";

let validator: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (!validator) {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    addFormats(ajv);
    validator = ajv.compile(moduleGraphSchema);
  }
  return validator;
}

export interface ModuleGraphValidationResult {
  valid: boolean;
  errors: string[];
  contentSha256: string;
  citationCoverage: number;
}

function hasDuplicates(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

function prerequisiteHasCycle(graph: ModuleGraph): boolean {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) adjacency.set(node.id, []);
  for (const edge of graph.edges) {
    if (edge.type === "prerequisite") adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;
    visiting.add(nodeId);
    for (const next of adjacency.get(nodeId) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  };

  return graph.nodes.some((node) => visit(node.id));
}

export function validateModuleGraph(
  graph: ModuleGraph,
  options: { evidenceSourceIds?: string[] } = {},
): ModuleGraphValidationResult {
  const errors: string[] = [];
  const validate = getValidator();
  if (!validate(graph)) {
    for (const error of validate.errors ?? []) {
      errors.push(`${error.instancePath || "/"} ${error.message ?? "is invalid"}`);
    }
  }

  const conceptIds = graph.module?.concepts?.map((concept) => concept.id) ?? [];
  const sourceIds = graph.sources?.map((source) => source.id) ?? [];
  const nodeIds = graph.nodes?.map((node) => node.id) ?? [];
  const rubricIds = graph.rubrics?.map((rubric) => rubric.id) ?? [];

  if (hasDuplicates(conceptIds)) errors.push("Concept IDs must be unique.");
  if (hasDuplicates(sourceIds)) errors.push("Source IDs must be unique.");
  if (hasDuplicates(nodeIds)) errors.push("Node IDs must be unique.");
  if (hasDuplicates(rubricIds)) errors.push("Rubric IDs must be unique.");

  const conceptSet = new Set(conceptIds);
  const sourceSet = new Set(sourceIds);
  const nodeSet = new Set(nodeIds);
  const rubricSet = new Set(rubricIds);

  for (const outcome of graph.module?.outcomes ?? []) {
    for (const conceptId of outcome.conceptIds) {
      if (!conceptSet.has(conceptId)) errors.push(`Outcome ${outcome.id} references missing concept ${conceptId}.`);
    }
  }

  for (const node of graph.nodes ?? []) {
    for (const conceptId of node.conceptIds) {
      if (!conceptSet.has(conceptId)) errors.push(`Node ${node.id} references missing concept ${conceptId}.`);
    }
    for (const citation of node.citations) {
      if (!sourceSet.has(citation.sourceId)) errors.push(`Node ${node.id} cites missing source ${citation.sourceId}.`);
      if (options.evidenceSourceIds && !options.evidenceSourceIds.includes(citation.sourceId)) {
        errors.push(`Node ${node.id} cites source ${citation.sourceId} outside the evidence bundle.`);
      }
    }
    if (node.assessment && !rubricSet.has(node.assessment.rubricId)) {
      errors.push(`Node ${node.id} references missing rubric ${node.assessment.rubricId}.`);
    }
  }

  for (const edge of graph.edges ?? []) {
    if (!nodeSet.has(edge.fromNodeId) || !nodeSet.has(edge.toNodeId)) {
      errors.push(`Edge ${edge.fromNodeId} -> ${edge.toNodeId} references a missing node.`);
    }
  }

  if (graph.nodes && prerequisiteHasCycle(graph)) errors.push("Prerequisite graph contains a cycle.");

  const nodeTypes = new Set(graph.nodes?.map((node) => node.type) ?? []);
  if (!nodeTypes.has("concept")) errors.push("Module graph must contain a concept node.");
  if (!nodeTypes.has("retrieval") && !nodeTypes.has("quiz")) errors.push("Module graph must contain retrieval or quiz.");
  if (!nodeTypes.has("transfer") && !nodeTypes.has("reorder")) errors.push("Module graph must contain transfer or reorder.");
  if (!nodeTypes.has("boss_proof")) errors.push("Module graph must contain a Boss Proof node.");

  const conceptNodes = graph.nodes?.filter((node) => node.type === "concept") ?? [];
  const citedConceptNodes = conceptNodes.filter((node) => node.citations.length > 0).length;
  const citationCoverage = conceptNodes.length === 0 ? 0 : citedConceptNodes / conceptNodes.length;

  return {
    valid: errors.length === 0,
    errors,
    contentSha256: stableHash(graph),
    citationCoverage,
  };
}

const ALWAYS_HIDDEN_KEYS = new Set([
  "assessmentSignals",
  "conceptTermGroups",
  "correctChoiceIds",
  "correctOrder",
  "expectedTerms",
  "internalScoringNotes",
  "answerKey",
]);

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (!ALWAYS_HIDDEN_KEYS.has(key)) output[key] = sanitizeValue(nested);
  }
  return output;
}

export function toPlayerGraph(graph: ModuleGraph, submittedNodeIds = new Set<string>()): ModuleGraph {
  const cloned = structuredClone(graph);
  cloned.nodes = cloned.nodes.map((node) => {
    const content = sanitizeValue(node.content) as Record<string, unknown>;
    const revealPolicy = node.assessment?.revealPolicy;
    const canRevealSample = revealPolicy === "immediate" || (revealPolicy === "after_submit" && submittedNodeIds.has(node.id));
    if (!canRevealSample) delete content.sampleAnswer;
    return { ...node, content };
  });
  return cloned;
}

export interface EvidenceArtifactForGraph {
  artifactId: string;
  kind: string;
  displayName: string;
  originUri: string | null;
  isPrompt: boolean;
  chunks: Array<{ text: string; locator: string; weight: number }>;
}

export interface GenerateLocalModuleGraphInput {
  jobId: string;
  userId: string;
  projectTitle: string;
  goal: string;
  locale: string;
  depth: "intro" | "standard" | "deep";
  timeBudgetMinutes: number;
  artifacts: EvidenceArtifactForGraph[];
  pipelineVersion: string;
  modelIds: string[];
  createdByType: "ai_assisted" | "system_seed";
  attributionDisplayName: string;
}

function sourceKindForArtifact(artifact: EvidenceArtifactForGraph): string {
  if (artifact.kind === "youtube_url" || artifact.kind === "facebook_url") return "external_video";
  if (artifact.kind === "website_url") return "external_web";
  return "user_artifact";
}

export function generateLocalModuleGraph(input: GenerateLocalModuleGraphInput): ModuleGraph {
  const topicLabel = truncateText(input.projectTitle || input.goal, 110) || "Chủ đề học tập của bạn";
  const substantiveChunks = input.artifacts.flatMap((artifact) =>
    artifact.chunks.filter((chunk) => chunk.weight >= 1).map((chunk) => ({ artifact, chunk })),
  );
  const evidenceExcerpt = truncateText(substantiveChunks[0]?.chunk.text ?? input.goal, 850);
  const hasSubstantiveEvidence = substantiveChunks.some(({ artifact }) => !artifact.isPrompt);
  const conceptTopicId = `core_${slugifyAscii(topicLabel, "topic").slice(0, 48)}`;

  const sources = input.artifacts.map((artifact, index) => {
    const source: Record<string, unknown> = {
      id: `source_${index + 1}`,
      kind: sourceKindForArtifact(artifact),
      title: truncateText(artifact.displayName || artifact.originUri || `Nguồn ${index + 1}`, 280),
      artifactId: artifact.artifactId,
      rightsStatus: artifact.originUri ? "link_only" : "user_provided",
      locators: artifact.chunks[0]
        ? [{ type: "span", value: artifact.chunks[0].locator }]
        : artifact.originUri
          ? [{ type: "url_fragment", value: "metadata-only" }]
          : [],
    };
    if (artifact.originUri) source.uri = artifact.originUri;
    return source as ModuleGraph["sources"][number];
  });

  const citationSourceIds = sources.slice(0, 3).map((source) => source.id);
  const citations = citationSourceIds.map((sourceId) => ({ sourceId, support: "supports" as const }));
  const estimatedMinutes = Math.max(20, Math.min(60, input.timeBudgetMinutes || 30));

  return {
    schemaVersion: "gon.module-graph/1.0",
    module: {
      title: truncateText(`Hiểu và áp dụng: ${topicLabel}`, 175),
      summary: truncateText(
        `Một lộ trình học riêng tư bắt đầu từ bằng chứng bạn cung cấp để đạt mục tiêu “${input.goal}”. Module tách điều nguồn thực sự nói, điều bạn suy luận và điều bạn sẽ tạo ra để chứng minh hiểu biết.`,
        1150,
      ),
      locale: input.locale || "vi-VN",
      estimatedMinutes,
      difficulty: input.depth === "intro" ? "beginner" : input.depth === "deep" ? "advanced" : "intermediate",
      outcomes: [
        {
          id: "outcome_explain",
          statement: `Giải thích bằng lời của mình các ý chính và giới hạn bằng chứng liên quan tới ${topicLabel}.`,
          conceptIds: [conceptTopicId, "evidence_and_sources"],
        },
        {
          id: "outcome_create",
          statement: "Tạo một artifact học tập ngắn có mục tiêu, nguồn và khai báo hỗ trợ AI rõ ràng.",
          conceptIds: ["application_context", "evidence_and_sources"],
        },
      ],
      concepts: [
        {
          id: conceptTopicId,
          name: topicLabel,
          description: "Vấn đề trung tâm của project và mục tiêu học hiện tại; mọi kết luận cụ thể phải đối chiếu với nguồn đã cung cấp.",
          role: "core",
        },
        {
          id: "evidence_and_sources",
          name: "Bằng chứng và nguồn",
          description: "Biết phần nào là dữ liệu gốc, phần nào là suy luận và phần nào còn chưa được nguồn hỗ trợ.",
          role: "core",
        },
        {
          id: "application_context",
          name: "Ứng dụng vào bối cảnh thật",
          description: "Chuyển nguyên lý đã hiểu sang một tình huống mới và mô tả cách kiểm chứng kết quả.",
          role: "core",
        },
      ],
      prerequisites: [],
      safetyNotices: [
        "Đây là bản nháp riêng tư được tổ chức từ đầu vào của bạn; hãy đối chiếu claim quan trọng với nguồn gốc trước khi áp dụng ngoài đời.",
      ],
    },
    sources,
    nodes: [
      {
        id: "concept_main",
        type: "concept",
        title: "Đọc bằng chứng trước khi kết luận",
        conceptIds: [conceptTopicId, "evidence_and_sources"],
        content: {
          blocks: [
            {
              kind: "paragraph",
              text: `Mục tiêu của module là biến đầu vào về “${topicLabel}” thành hiểu biết có thể kiểm chứng. Trước hết, hãy tách ba lớp: dữ kiện có trong nguồn, cách bạn diễn giải và hành động bạn dự định làm.`,
            },
            {
              kind: "source_excerpt",
              text: evidenceExcerpt,
            },
            {
              kind: "example",
              text: "Một ghi chú học tốt có dạng: nguồn nói gì, điều đó hỗ trợ kết luận nào, điều gì còn thiếu và bạn sẽ kiểm chứng phần thiếu bằng cách nào.",
            },
          ],
        },
        citations,
        estimatedMinutes: Math.max(5, Math.round(estimatedMinutes * 0.3)),
        accessibility: {
          textAlternative: "Bài học dạng văn bản: phân biệt dữ kiện trong nguồn, diễn giải và hành động áp dụng.",
        },
      },
      {
        id: "retrieval_core",
        type: "retrieval",
        title: "Tự giải thích mà không nhìn đáp án",
        conceptIds: [conceptTopicId, "evidence_and_sources"],
        content: {
          prompt: `Bằng lời của bạn, hãy giải thích ý chính về ${topicLabel}, bằng chứng nào trong nguồn hỗ trợ ý đó và giới hạn nào khiến bạn chưa nên kết luận quá xa.`,
          sampleAnswer: `Ý chính cần được nối trực tiếp với bằng chứng trong nguồn về ${topicLabel}. Khi nguồn chỉ cho thấy một phần bối cảnh, kết luận phải giữ ở phạm vi đó và nêu rõ phần cần kiểm chứng thêm trước khi áp dụng.`,
          conceptTermGroups: [
            [topicLabel],
            ["nguồn", "bằng chứng", "dữ kiện", "đối chiếu"],
            ["giới hạn", "chưa đủ", "kiểm chứng", "bối cảnh"],
          ],
        },
        citations: [],
        estimatedMinutes: Math.max(4, Math.round(estimatedMinutes * 0.2)),
        accessibility: { textAlternative: "Câu hỏi truy hồi dạng văn bản; đáp án mẫu chỉ mở sau khi nộp." },
        assessment: {
          rubricId: "rubric_retrieval",
          masteryTarget: "recall",
          revealPolicy: "after_submit",
          requiredForCompletion: true,
        },
      },
      {
        id: "transfer_new_context",
        type: "transfer",
        title: "Áp dụng sang một tình huống mới",
        conceptIds: [conceptTopicId, "application_context"],
        content: {
          prompt:
            "Hãy viết theo ba mục rõ ràng: “Bối cảnh mới:”, “Cách áp dụng:” và “Cách đo kết quả:”. Tình huống phải khác ví dụ trong nguồn và phải nối cách áp dụng với ý chính đã học.",
          requiredSections: ["Bối cảnh mới", "Cách áp dụng", "Cách đo kết quả"],
          conceptTermGroups: [[topicLabel], ["áp dụng", "thực hiện", "thiết kế"], ["đo", "kiểm chứng", "kết quả", "tiêu chí"]],
        },
        citations: [],
        estimatedMinutes: Math.max(5, Math.round(estimatedMinutes * 0.25)),
        accessibility: { textAlternative: "Nhiệm vụ transfer dạng văn bản có ba mục bắt buộc." },
        assessment: {
          rubricId: "rubric_transfer",
          masteryTarget: "apply",
          revealPolicy: "after_submit",
          requiredForCompletion: true,
        },
      },
      {
        id: "boss_artifact",
        type: "boss_proof",
        title: "Tạo artifact chứng minh bạn đã hiểu",
        conceptIds: [conceptTopicId, "evidence_and_sources", "application_context"],
        content: {
          prompt:
            "Tạo mô tả artifact học tập hoàn chỉnh theo bốn mục: “Mục tiêu học:”, “Giá trị cốt lõi:”, “Nội dung artifact:” và “Cách người khác sử dụng/kiểm tra:”. Khai báo nguồn và hỗ trợ AI trong biểu mẫu nộp.",
          requiredSections: ["Mục tiêu học", "Giá trị cốt lõi", "Nội dung artifact", "Cách người khác sử dụng/kiểm tra"],
          requiredDisclosures: ["sources", "ai_assistance", "changes_from_inspiration"],
        },
        citations,
        estimatedMinutes: Math.max(6, Math.round(estimatedMinutes * 0.25)),
        accessibility: {
          textAlternative: "Có thể nộp artifact bằng mô tả văn bản có cấu trúc thay vì file media.",
        },
        assessment: {
          rubricId: "rubric_boss",
          masteryTarget: "create",
          revealPolicy: "after_submit",
          requiredForCompletion: true,
        },
      },
    ],
    edges: [
      { fromNodeId: "concept_main", toNodeId: "retrieval_core", type: "prerequisite" },
      { fromNodeId: "retrieval_core", toNodeId: "transfer_new_context", type: "prerequisite" },
      { fromNodeId: "transfer_new_context", toNodeId: "boss_artifact", type: "prerequisite" },
    ],
    rubrics: [
      {
        id: "rubric_retrieval",
        version: "1.0",
        title: "Truy hồi ý chính và giới hạn bằng chứng",
        criteria: [
          {
            id: "covers_core_ideas",
            description: "Nêu được chủ đề trung tâm và cách nguồn/bằng chứng hỗ trợ cách hiểu.",
            weight: 0.45,
            required: true,
          },
          {
            id: "explains_limits",
            description: "Nêu giới hạn hoặc phần cần kiểm chứng thêm thay vì kết luận tuyệt đối.",
            weight: 0.3,
            required: true,
          },
          {
            id: "own_words",
            description: "Diễn đạt bằng lời của người học, không sao chép nguyên văn đáp án/nguồn.",
            weight: 0.25,
            required: true,
          },
        ],
        passRule: { type: "all_required" },
        evidenceTypes: ["text"],
        feedbackGuidance: "Chỉ rõ ý còn thiếu và hướng người học quay lại phần bằng chứng tương ứng.",
        xpRuleId: "xp.retrieval_pass.v1",
      },
      {
        id: "rubric_transfer",
        version: "1.0",
        title: "Chuyển giao sang bối cảnh mới",
        criteria: [
          {
            id: "new_context",
            description: "Có mục Bối cảnh mới khác ví dụ gốc.",
            weight: 0.35,
            required: true,
          },
          {
            id: "mechanism_fit",
            description: "Cách áp dụng nối rõ với ý chính đã học.",
            weight: 0.35,
            required: true,
          },
          {
            id: "evidence_plan",
            description: "Có cách đo/kiểm chứng kết quả thay vì chỉ tuyên bố thành công.",
            weight: 0.3,
            required: true,
          },
        ],
        passRule: { type: "all_required" },
        evidenceTypes: ["text", "artifact"],
        feedbackGuidance: "Phân biệt sao chép bề mặt với chuyển giao nguyên lý vào tình huống mới.",
        xpRuleId: "xp.transfer_pass.v1",
      },
      {
        id: "rubric_boss",
        version: "1.0",
        title: "Boss Proof artifact học tập",
        criteria: [
          {
            id: "learning_goal",
            description: "Artifact có mục tiêu học và đối tượng sử dụng rõ ràng.",
            weight: 0.25,
            required: true,
          },
          {
            id: "provenance",
            description: "Khai báo nguồn, hỗ trợ AI và phần thay đổi của tác giả.",
            weight: 0.25,
            required: true,
          },
          {
            id: "core_value",
            description: "Giải thích giá trị cốt lõi bằng hiểu biết của người học.",
            weight: 0.3,
            required: true,
          },
          {
            id: "usable_artifact",
            description: "Nội dung đủ rõ để người khác sử dụng hoặc kiểm tra được.",
            weight: 0.2,
            required: true,
          },
        ],
        passRule: { type: "all_required" },
        evidenceTypes: ["artifact", "text"],
        feedbackGuidance: "Trả feedback theo từng tiêu chí; độ tương đồng cao chỉ là tín hiệu cần review, không phải kết luận gian lận.",
        xpRuleId: "xp.boss_proof_pass.v1",
      },
    ],
    renderTargets: ["web", "infographic", "video", "image_sequence", "easy_task", "teach_back"],
    provenance: {
      createdByType: input.createdByType,
      createdByUserId: input.userId,
      sourceArtifactIds: input.artifacts.map((artifact) => artifact.artifactId),
      generation: {
        brewJobId: input.jobId,
        agentPipelineVersion: input.pipelineVersion,
        modelIds: input.modelIds,
        promptTemplateVersions: ["vs1-local-module-generator-v1"],
      },
      attribution: {
        displayName: input.attributionDisplayName,
        upstreamModuleVersionId: null,
      },
    },
    quality: {
      citationCoverage: hasSubstantiveEvidence ? 1 : 0.67,
      unverifiedClaimIds: hasSubstantiveEvidence ? [] : ["topic_specific_claims"],
    },
  };
}
