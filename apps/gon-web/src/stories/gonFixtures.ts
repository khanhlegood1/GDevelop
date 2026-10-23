import type { AnyRecord } from "@/lib/api";
import { progressFromXp } from "@/server/progression";

export type GonDatasetVariant = "retrieval" | "boss" | "clarification";

export const STORYBOOK_IDS = {
  user: "usr_storybook_learner",
  mainProject: "prj_storybook_viral_music",
  secondaryProject: "prj_storybook_delta",
  clarificationProject: "prj_storybook_clarification",
  promptArtifact: "art_storybook_prompt",
  videoArtifact: "art_storybook_youtube",
  search: "search_storybook_related",
  clarificationSearch: "search_storybook_clarification",
  brewJob: "job_storybook_brew",
  moduleVersion: "modv_storybook_viral_v1",
  candidateSet: "candset_storybook_viral",
  journey: "jrn_storybook_current",
  priorJourney: "jrn_storybook_prior",
} as const;

const CREATED_AT = "2026-10-23T01:15:00.000Z";
const UPDATED_AT = "2026-10-23T02:30:00.000Z";

export interface GonStorybookDataset {
  projects: AnyRecord[];
  projectList: AnyRecord[];
  workspaceByProjectId: Record<string, AnyRecord>;
  explorerByProjectId: Record<string, AnyRecord | null>;
  journeys: AnyRecord[];
  playersByJourneyId: Record<string, AnyRecord>;
  progress: AnyRecord;
  xpLedger: AnyRecord[];
  proofs: AnyRecord[];
  brewJob: AnyRecord;
  searchByProjectId: Record<string, AnyRecord>;
}

function makeProgress(
  lifetimeXp: number,
  mastery: AnyRecord[],
  latestProof: AnyRecord | null,
  nextSteps: AnyRecord[],
): AnyRecord {
  return {
    ...progressFromXp(lifetimeXp),
    mastery,
    latestProof,
    nextSteps,
  };
}

function mastery(conceptId: string, level: string, evidenceAttemptId: string | null = null): AnyRecord {
  return {
    conceptId,
    level,
    evidenceAttemptId,
    achievedAt: evidenceAttemptId ? "2026-10-23T02:00:00.000Z" : null,
    reviewDueAt: null,
  };
}

function ledgerEntry(
  sequence: number,
  delta: number,
  ruleVersion: string,
  sourceId: string,
  createdAt: string,
): AnyRecord {
  return {
    id: `xp_storybook_${sequence}`,
    delta,
    sourceEventId: `evt_storybook_xp_${sequence}`,
    sourceType: "learning_attempt",
    sourceId,
    ruleVersion,
    formulaVersion: "gon-level-v1",
    status: "posted",
    reversesEntryId: null,
    createdAt,
  };
}

function priorLedger(): AnyRecord[] {
  return [
    ledgerEntry(9, 5, "xp.delayed_review_pass.v1", "att_storybook_prior_review", "2026-10-21T03:15:00.000Z"),
    ledgerEntry(8, 20, "xp.teach_back_pass.v1", "att_storybook_prior_teach", "2026-10-21T03:05:00.000Z"),
    ledgerEntry(7, 35, "xp.boss_proof_pass.v1", "att_storybook_prior_boss", "2026-10-20T04:20:00.000Z"),
    ledgerEntry(6, 15, "xp.transfer_pass.v1", "att_storybook_prior_transfer", "2026-10-20T04:05:00.000Z"),
    ledgerEntry(5, 10, "xp.retrieval_pass.v1", "att_storybook_prior_retrieval", "2026-10-20T03:45:00.000Z"),
  ];
}

function systemProof(): AnyRecord {
  return {
    id: "proof_storybook_system",
    proofType: "boss_proof",
    title: "Boss Proof — Đọc bằng chứng trước khi kết luận",
    description:
      "Artifact Boss Proof đạt rubric trong GON và được liên kết với Journey Branch mẫu của Storybook.",
    journeyId: STORYBOOK_IDS.priorJourney,
    attemptId: "att_storybook_prior_boss",
    artifactIds: [],
    issuerDisplayName: "GON",
    externalReference: null,
    verificationLevel: "system_recorded",
    status: "active",
    visibility: "private",
    proves: [
      "Người học đã nộp artifact và đạt rubric của Boss Proof trong hệ thống GON.",
      "Proof liên kết tới journey, attempt và rubric version đã chấm.",
    ],
    doesNotProve: [
      "Không chứng minh danh tính pháp lý hoặc bằng cấp bên ngoài.",
      "Không phải chứng nhận do issuer bên ngoài cấp.",
    ],
    version: 1,
    createdAt: "2026-10-20T04:20:00.000Z",
    updatedAt: "2026-10-20T04:20:00.000Z",
  };
}

function sourceLinkedProof(): AnyRecord {
  return {
    id: "proof_storybook_certificate",
    proofType: "certificate_link",
    title: "Chứng chỉ tư duy phản biện — liên kết nguồn mẫu",
    description:
      "Metadata do người học lưu trong Proof Vault. Storybook không gọi đây là chứng chỉ đã được issuer xác minh.",
    journeyId: null,
    attemptId: null,
    artifactIds: [],
    issuerDisplayName: "Issuer tự khai trong dữ liệu mẫu",
    externalReference: "https://example.org/storybook/certificate",
    verificationLevel: "source_linked",
    status: "active",
    visibility: "private",
    proves: ["Người dùng đã liên kết một nguồn với tuyên bố học tập này trong Proof Vault."],
    doesNotProve: [
      "GON chưa đối chiếu issuer hoặc chữ ký của chứng chỉ.",
      "Việc gắn link không cộng XP và không biến proof thành Issuer-verified.",
    ],
    version: 1,
    createdAt: "2026-10-18T02:00:00.000Z",
    updatedAt: "2026-10-18T02:00:00.000Z",
  };
}

function mainProject(): AnyRecord {
  return {
    id: STORYBOOK_IDS.mainProject,
    title: "Vì sao một bài hát có thể viral sau một đêm?",
    goal: "Tạo infographic 5 phút giải thích cơ chế lan truyền mà không hứa hẹn viral",
    status: "learning",
    visibility: "private",
    learningMode: "create_publish",
    depth: "standard",
    timeBudgetMinutes: 30,
    locale: "vi-VN",
    version: 4,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function secondaryProject(): AnyRecord {
  return {
    id: STORYBOOK_IDS.secondaryProject,
    title: "Thủy triều, phù sa và lịch canh tác",
    goal: "Vẽ một bản đồ hệ thống trước khi kết luận về mùa vụ ở đồng bằng",
    status: "draft",
    visibility: "private",
    learningMode: "deep_mastery",
    depth: "standard",
    timeBudgetMinutes: 35,
    locale: "vi-VN",
    version: 1,
    createdAt: "2026-10-22T01:00:00.000Z",
    updatedAt: "2026-10-22T01:20:00.000Z",
  };
}

function clarificationProject(): AnyRecord {
  return {
    id: STORYBOOK_IDS.clarificationProject,
    title: "Học về AI",
    goal: "Hiểu AI để làm nội dung",
    status: "needs_decision",
    visibility: "private",
    learningMode: "fast_entertaining",
    depth: "intro",
    timeBudgetMinutes: 15,
    locale: "vi-VN",
    version: 1,
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
  };
}

function artifact(
  id: string,
  projectId: string,
  kind: string,
  displayName: string,
  originUri: string | null,
  extractionStatus: string,
  coverage: AnyRecord,
): AnyRecord {
  return {
    id,
    projectId,
    kind,
    displayName,
    originUri,
    extractionStatus,
    safetyStatus: "allowed",
    coverage,
    createdAt: CREATED_AT,
    version: 1,
  };
}

function relatedSearch(): AnyRecord {
  return {
    id: STORYBOOK_IDS.search,
    projectId: STORYBOOK_IDS.mainProject,
    status: "completed",
    verdict: "related",
    matchedConcepts: ["Hook và giá trị cốt lõi", "Mạng lưới lan truyền"],
    missingConcepts: ["Artifact dạy lại cho ngách của người học"],
    clarificationQuestions: [],
    results: [
      {
        moduleVersionId: "modv_storybook_related",
        rank: 1,
        title: "Cơ chế lan truyền nội dung — bản liên quan",
        sourceStatus: "partially_cited",
        reasonCodes: ["same_core_concepts", "partially_cited_sources"],
        matchedConcepts: ["Hook và giá trị cốt lõi"],
        missingConcepts: ["Artifact dạy lại cho ngách của người học"],
      },
    ],
  };
}

function clarificationSearch(): AnyRecord {
  return {
    id: STORYBOOK_IDS.clarificationSearch,
    projectId: STORYBOOK_IDS.clarificationProject,
    status: "completed",
    verdict: "needs_clarification",
    matchedConcepts: [],
    missingConcepts: ["Mục tiêu học quan sát được", "Nguồn bằng chứng cụ thể"],
    clarificationQuestions: [
      {
        id: "clarify_outcome",
        question: "Bạn muốn giải thích, áp dụng hay tạo artifact từ chủ đề AI?",
      },
      {
        id: "clarify_evidence",
        question: "Bạn có video, bài viết hoặc tình huống thật nào muốn dùng làm bằng chứng không?",
      },
    ],
    results: [],
  };
}

function succeededBrewJob(): AnyRecord {
  return {
    id: STORYBOOK_IDS.brewJob,
    jobType: "brew_module",
    status: "succeeded",
    currentStep: "succeeded",
    attemptCount: 1,
    maxAttempts: 3,
    availableAt: CREATED_AT,
    createdAt: CREATED_AT,
    startedAt: CREATED_AT,
    completedAt: UPDATED_AT,
    failureCode: null,
    retryable: false,
    projectId: STORYBOOK_IDS.mainProject,
    searchAttemptId: STORYBOOK_IDS.search,
    resultModuleVersionId: STORYBOOK_IDS.moduleVersion,
    quota: { usedToday: 1, dailyLimit: 5 },
  };
}

const CANDIDATE_REASONS = [
  "high_relevance",
  "strong_concept_coverage",
  "fits_learning_mode",
  "fits_time_budget",
];

function candidate(
  id: string,
  title: string,
  promise: string,
  cluster: string,
  format: string,
  estimatedMinutes: number,
  difficulty: string,
  artifactOutcome: string,
  sourceStatus = "partially_cited",
): AnyRecord {
  return {
    id,
    moduleVersionId: STORYBOOK_IDS.moduleVersion,
    rank: 0,
    title,
    promise,
    cluster,
    format,
    estimatedMinutes,
    difficulty,
    artifactOutcome,
    prerequisiteConceptIds: [],
    conceptIds: ["hook_value", "network_diffusion", "context_timing", "remixability"],
    sourceStatus,
    status: "eligible",
    rankingReasonCodes: [...CANDIDATE_REASONS],
    preference: null,
  };
}

export function createStorybookCandidates(): AnyRecord[] {
  return [
    candidate(
      "cand_storybook_infographic",
      "Infographic 4 ô: Hook, mạng lưới, thời điểm, remix",
      "Biến cơ chế lan truyền thành một artifact nhìn nhanh, có citation và câu hỏi kiểm tra.",
      "create",
      "infographic",
      25,
      "intermediate",
      "Infographic có nguồn",
    ),
    candidate(
      "cand_storybook_web",
      "Đọc sâu: Viral là một hệ thống, không phải công thức",
      "Đi từ bằng chứng tới Retrieval, Transfer và Boss Proof trong một web lesson hoàn chỉnh.",
      "mastery",
      "web_lesson",
      30,
      "intermediate",
      "Bản đồ cơ chế có citation",
      "citation_checked",
    ),
    candidate(
      "cand_storybook_game",
      "Mini-game mô phỏng mạng lưới chia sẻ đầu tiên",
      "Thử thay đổi cộng đồng hạt giống và thời điểm để thấy vì sao cùng nội dung cho kết quả khác nhau.",
      "create",
      "game",
      40,
      "advanced",
      "Game brief có rubric",
    ),
    candidate(
      "cand_storybook_video",
      "Storyboard video 60 giây dạy lại cơ chế viral",
      "Thiết kế hook, giá trị học thật và disclosure cho một video ngắn không hứa hẹn viral.",
      "create",
      "video",
      35,
      "intermediate",
      "Storyboard + disclosure",
    ),
    candidate(
      "cand_storybook_teach",
      "Teach-back: Giải thích cho một người bạn trong 3 phút",
      "Tự nói lại bằng lời của mình và nhận một câu hỏi phản biện về giới hạn bằng chứng.",
      "apply",
      "teach_back",
      20,
      "beginner",
      "Bản ghi teach-back",
    ),
    candidate(
      "cand_storybook_fast",
      "Thử thách 12 phút: Tách hook khỏi giá trị cốt lõi",
      "Một easy task ngắn để phân biệt phần gây chú ý với phần kiến thức có thể dạy lại.",
      "fast",
      "easy_task",
      12,
      "beginner",
      "Checklist áp dụng nhanh",
    ),
  ].map((item, index) => ({ ...item, rank: index + 1 }));
}

export function createStorybookExplorer(mode = "create_publish"): AnyRecord {
  const candidates = createStorybookCandidates();
  return {
    projectId: STORYBOOK_IDS.mainProject,
    candidateSet: {
      id: STORYBOOK_IDS.candidateSet,
      status: "ready_with_shortfall",
      targetCount: 10,
      actualCount: candidates.length,
      shortfallReasonCodes: ["limited_distinct_candidates"],
    },
    rankingSnapshot: {
      id: `rank_storybook_${mode}`,
      candidateSetId: STORYBOOK_IDS.candidateSet,
      learningMode: mode,
      algorithmVersion: "gon-rank-storybook-v1",
      personalizationApplied: true,
      orderedCandidateIds: candidates.map((item) => String(item.id)),
      explanationCodes: ["storybook_fixture", "internal_trend_not_used_in_vs1"],
      createdAt: UPDATED_AT,
      staleAt: "2026-10-23T03:30:00.000Z",
    },
    candidates,
    status: "ready_with_shortfall",
  };
}

function rubric(
  id: string,
  title: string,
  criteria: Array<[string, string, number]>,
  evidenceTypes: string[],
  xpRuleId: string,
): AnyRecord {
  return {
    id,
    version: "1.0",
    title,
    criteria: criteria.map(([criterionId, description, weight]) => ({
      id: criterionId,
      description,
      weight,
      required: true,
    })),
    passRule: { type: "all_required" },
    evidenceTypes,
    feedbackGuidance: "Chỉ rõ tiêu chí còn thiếu; không kết luận gian lận chỉ từ độ tương đồng.",
    xpRuleId,
  };
}

export function createStorybookPlayerGraph(includeSampleAnswer = false): AnyRecord {
  const retrievalContent: AnyRecord = {
    prompt:
      "Bằng lời của bạn, giải thích ý chính về cơ chế viral, bằng chứng nào trong nguồn hỗ trợ ý đó và giới hạn nào khiến bạn chưa nên kết luận quá xa.",
  };
  if (includeSampleAnswer) {
    retrievalContent.sampleAnswer =
      "Ý chính cần nối trực tiếp với bằng chứng: hook chỉ giúp dừng lại; cộng đồng chia sẻ đầu tiên, thời điểm văn hóa và khả năng remix mới quyết định nội dung đi xa. Một video đơn lẻ chưa đủ để kết luận công thức chung.";
  }

  return {
    schemaVersion: "gon.module-graph/1.0",
    module: {
      title: "Hiểu và áp dụng: Vì sao một bài hát có thể viral sau một đêm?",
      summary:
        "Một lộ trình học riêng tư bắt đầu từ prompt và metadata video của bạn để tách dữ kiện, diễn giải và hành động áp dụng.",
      locale: "vi-VN",
      estimatedMinutes: 30,
      difficulty: "intermediate",
      outcomes: [
        {
          id: "outcome_explain",
          statement: "Giải thích bằng lời của mình vì sao sao chép bề mặt không sao chép được điều kiện lan truyền.",
          conceptIds: ["network_diffusion", "context_timing"],
        },
        {
          id: "outcome_create",
          statement: "Tạo artifact dạy lại có mục tiêu, nguồn và khai báo hỗ trợ AI rõ ràng.",
          conceptIds: ["hook_value", "remixability"],
        },
      ],
      concepts: [
        {
          id: "hook_value",
          name: "Hook và giá trị cốt lõi",
          description: "Hook giúp dừng lại; giá trị nhắc lại được mới giúp nội dung được dạy lại.",
          role: "core",
        },
        {
          id: "network_diffusion",
          name: "Mạng lưới lan truyền",
          description: "Cộng đồng chia sẻ đầu tiên và hệ thống phân phối ảnh hưởng tốc độ lan truyền.",
          role: "core",
        },
        {
          id: "context_timing",
          name: "Thời điểm và bối cảnh",
          description: "Cùng một nội dung có thể cho kết quả khác nhau ở thời điểm khác nhau.",
          role: "core",
        },
        {
          id: "remixability",
          name: "Khả năng remix",
          description: "Nội dung dễ biến tấu có thêm đường lan truyền nhưng vẫn cần giá trị thật.",
          role: "supporting",
        },
      ],
      prerequisites: [],
      safetyNotices: ["Module không hứa nội dung sẽ viral hay tạo thu nhập."],
    },
    sources: [
      {
        id: "source_prompt",
        kind: "user_artifact",
        title: "Prompt gốc của người học",
        artifactId: STORYBOOK_IDS.promptArtifact,
        rightsStatus: "user_provided",
        locators: [{ type: "span", value: "prompt" }],
      },
      {
        id: "source_video",
        kind: "external_video",
        title: "Video bài hát viral — metadata-only",
        artifactId: STORYBOOK_IDS.videoArtifact,
        uri: "https://www.youtube.com/watch?v=viralMusic123",
        rightsStatus: "link_only",
        locators: [{ type: "url_fragment", value: "metadata-only" }],
      },
    ],
    nodes: [
      {
        id: "concept_main",
        type: "concept",
        title: "Đọc bằng chứng trước khi kết luận",
        conceptIds: ["hook_value", "network_diffusion", "context_timing"],
        content: {
          blocks: [
            {
              kind: "paragraph",
              text: "Một hook mạnh chỉ là điểm bắt đầu. Hãy tách điều nguồn thực sự cho thấy, phần bạn suy luận và hành động bạn dự định kiểm chứng.",
            },
            {
              kind: "source_excerpt",
              text: "Vì sao một bài hát có thể viral sau một đêm? Tôi muốn hiểu hook, cộng đồng chia sẻ đầu tiên, thời điểm văn hóa và khả năng remix thay vì chỉ sao chép bề mặt.",
            },
            {
              kind: "example",
              text: "Video đi kèm mới ở mức metadata-only trong VS1. GON không tuyên bố đã đọc transcript hay nội dung chính của video.",
            },
          ],
        },
        citations: [
          { sourceId: "source_prompt", locator: "prompt", support: "supports" },
          { sourceId: "source_video", locator: "metadata-only", support: "background" },
        ],
        estimatedMinutes: 8,
        accessibility: {
          textAlternative: "Bài học dạng văn bản về hook, mạng lưới, thời điểm, remix và giới hạn metadata.",
        },
      },
      {
        id: "retrieval_core",
        type: "retrieval",
        title: "Tự giải thích mà không nhìn đáp án",
        conceptIds: ["network_diffusion", "context_timing"],
        content: retrievalContent,
        citations: [],
        estimatedMinutes: 6,
        accessibility: { textAlternative: "Câu hỏi truy hồi dạng văn bản." },
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
        conceptIds: ["hook_value", "remixability"],
        content: {
          prompt:
            "Viết theo ba mục “Bối cảnh mới:”, “Cách áp dụng:” và “Cách đo kết quả:”. Tình huống phải khác ví dụ trong nguồn.",
        },
        citations: [],
        estimatedMinutes: 7,
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
        conceptIds: ["hook_value", "network_diffusion", "remixability"],
        content: {
          prompt:
            "Mô tả artifact theo bốn mục “Mục tiêu học:”, “Giá trị cốt lõi:”, “Nội dung artifact:” và “Cách người khác sử dụng/kiểm tra:”. Khai báo nguồn và hỗ trợ AI ở biểu mẫu bên dưới.",
        },
        citations: [{ sourceId: "source_prompt", locator: "prompt", support: "background" }],
        estimatedMinutes: 9,
        accessibility: { textAlternative: "Có thể nộp artifact bằng mô tả văn bản có cấu trúc." },
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
      rubric(
        "rubric_retrieval",
        "Truy hồi ý chính và giới hạn bằng chứng",
        [
          ["covers_core_ideas", "Nêu được các nhóm yếu tố cốt lõi ngoài bản thân nội dung.", 0.45],
          ["explains_limits", "Nêu giới hạn hoặc phần cần kiểm chứng thêm.", 0.3],
          ["own_words", "Diễn đạt bằng lời của người học.", 0.25],
        ],
        ["text"],
        "xp.retrieval_pass.v1",
      ),
      rubric(
        "rubric_transfer",
        "Chuyển giao sang bối cảnh mới",
        [
          ["new_context", "Có bối cảnh mới khác ví dụ nguồn.", 0.35],
          ["mechanism_fit", "Cách áp dụng nối rõ với cơ chế đã học.", 0.35],
          ["evidence_plan", "Có cách đo hoặc kiểm chứng kết quả.", 0.3],
        ],
        ["text", "artifact"],
        "xp.transfer_pass.v1",
      ),
      rubric(
        "rubric_boss",
        "Boss Proof artifact học tập",
        [
          ["learning_goal", "Artifact có mục tiêu học và đối tượng rõ ràng.", 0.25],
          ["provenance", "Khai báo nguồn, hỗ trợ AI và phần thay đổi của tác giả.", 0.25],
          ["core_value", "Giải thích giá trị cốt lõi bằng hiểu biết của người học.", 0.3],
          ["usable_artifact", "Nội dung đủ rõ để người khác sử dụng hoặc kiểm tra.", 0.2],
        ],
        ["artifact", "text"],
        "xp.boss_proof_pass.v1",
      ),
    ],
    renderTargets: ["web", "infographic", "video", "game", "easy_task", "teach_back"],
    provenance: {
      createdByType: "system_seed",
      createdByUserId: STORYBOOK_IDS.user,
      sourceArtifactIds: [STORYBOOK_IDS.promptArtifact, STORYBOOK_IDS.videoArtifact],
      generation: {
        brewJobId: STORYBOOK_IDS.brewJob,
        agentPipelineVersion: "storybook-fixture-v1",
        modelIds: ["storybook-deterministic-fixture"],
      },
      attribution: { displayName: "GON Storybook fixture", upstreamModuleVersionId: null },
    },
    quality: { citationCoverage: 0.85, unverifiedClaimIds: [] },
  };
}

function passedAssessment(criteriaIds: string[]): AnyRecord {
  return {
    decision: "passed",
    criteria: criteriaIds.map((criterionId) => ({
      criterionId,
      passed: true,
      feedback: "Bài làm mẫu đã có bằng chứng cho tiêu chí này.",
    })),
    feedback: "Bài làm mẫu đạt các tiêu chí bắt buộc của rubric.",
    confidence: 0.9,
    assessorType: "deterministic",
    assessorVersion: "storybook-fixture-v1",
    integritySignals: [],
  };
}

function makeAttempt(input: {
  id: string;
  journeyId: string;
  nodeId: string;
  rubricId: string;
  status: string;
  answerText: string | null;
  xpAwarded?: number;
  assessment?: AnyRecord | null;
  version?: number;
  attemptNumber?: number;
}): AnyRecord {
  return {
    id: input.id,
    journeyId: input.journeyId,
    moduleVersionId: STORYBOOK_IDS.moduleVersion,
    nodeId: input.nodeId,
    status: input.status,
    attemptNumber: input.attemptNumber ?? 1,
    answerText: input.answerText,
    artifactIds: [],
    rubricId: input.rubricId,
    rubricVersion: "1.0",
    assessment: input.assessment ?? null,
    xpAwarded: input.xpAwarded ?? 0,
    version: input.version ?? 1,
    sourceDisclosure: {},
    aiAssistanceDisclosure: {},
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    submittedAt: input.status === "draft" ? null : UPDATED_AT,
  };
}

function journey(
  id: string,
  status: string,
  currentNodeId: string | null,
  title: string,
  updatedAt = UPDATED_AT,
): AnyRecord {
  return {
    id,
    projectId: STORYBOOK_IDS.mainProject,
    sourceCandidateId: "cand_storybook_infographic",
    upstreamModuleVersionId: STORYBOOK_IDS.moduleVersion,
    title,
    goal: "Tạo infographic 5 phút giải thích cơ chế lan truyền mà không hứa hẹn viral",
    visibility: "private",
    status,
    attribution: {
      displayName: "GON Storybook fixture",
      upstreamModuleVersionId: STORYBOOK_IDS.moduleVersion,
      sourceCandidateId: "cand_storybook_infographic",
    },
    version: 2,
    currentNodeId,
    createdAt: CREATED_AT,
    updatedAt,
  };
}

function nodeState(id: string, status: string): AnyRecord {
  return {
    id,
    status,
    lockedReason: status === "locked" ? "requires_passed_attempt" : null,
  };
}

function makePlayer(stage: "retrieval" | "boss" | "completed"): AnyRecord {
  const isPrior = stage === "completed";
  const journeyId = isPrior ? STORYBOOK_IDS.priorJourney : STORYBOOK_IDS.journey;
  const attempts: AnyRecord[] = [];

  if (stage === "retrieval") {
    attempts.push(
      makeAttempt({
        id: "att_storybook_retrieval_draft",
        journeyId,
        nodeId: "retrieval_core",
        rubricId: "rubric_retrieval",
        status: "draft",
        answerText:
          "Hook giúp người xem dừng lại, nhưng mình cần nối rõ hơn bằng chứng từ prompt với giới hạn của một video đơn lẻ.",
        version: 2,
      }),
    );
  } else {
    attempts.push(
      makeAttempt({
        id: isPrior ? "att_storybook_prior_retrieval" : "att_storybook_retrieval_passed",
        journeyId,
        nodeId: "retrieval_core",
        rubricId: "rubric_retrieval",
        status: "passed",
        answerText:
          "Bằng lời của mình: hook chỉ là cửa vào. Bằng chứng từ prompt cho thấy phải xét cộng đồng chia sẻ đầu tiên, thời điểm văn hóa và khả năng remix; giới hạn là một video chưa đủ để kết luận công thức chung nếu chưa kiểm chứng.",
        xpAwarded: 10,
        assessment: passedAssessment(["covers_core_ideas", "explains_limits", "own_words"]),
      }),
      makeAttempt({
        id: isPrior ? "att_storybook_prior_transfer" : "att_storybook_transfer_passed",
        journeyId,
        nodeId: "transfer_new_context",
        rubricId: "rubric_transfer",
        status: "passed",
        answerText:
          "Bối cảnh mới: một lớp kỹ năng mềm cho sinh viên. Cách áp dụng: mở bằng tình huống 30 giây, nối hook với giá trị học thật và mời người học remix thành câu hỏi. Cách đo kết quả: tỉ lệ trả lời đúng câu hỏi truy hồi và số Boss Proof hoàn thành.",
        xpAwarded: 15,
        assessment: passedAssessment(["new_context", "mechanism_fit", "evidence_plan"]),
      }),
    );
  }

  if (stage === "boss") {
    attempts.push(
      makeAttempt({
        id: "att_storybook_boss_draft",
        journeyId,
        nodeId: "boss_artifact",
        rubricId: "rubric_boss",
        status: "draft",
        answerText:
          "Mục tiêu học: người mới sáng tạo nội dung phân biệt được hook với điều kiện lan truyền. Giá trị cốt lõi: mạng lưới đầu tiên, thời điểm và remix quyết định nội dung đi xa. Nội dung artifact: infographic bốn ô và một câu hỏi kiểm tra.",
        version: 2,
      }),
    );
  }

  if (stage === "completed") {
    attempts.push(
      makeAttempt({
        id: "att_storybook_prior_boss",
        journeyId,
        nodeId: "boss_artifact",
        rubricId: "rubric_boss",
        status: "passed",
        answerText:
          "Mục tiêu học: người mới hiểu vì sao sao chép bề mặt không tạo lại điều kiện lan truyền. Giá trị cốt lõi: hook, cộng đồng đầu tiên, thời điểm và remix là một hệ thống. Nội dung artifact: infographic bốn ô có citation. Cách người khác sử dụng/kiểm tra: đọc từng ô, trả lời câu hỏi cuối và đối chiếu nguồn đã khai báo.",
        xpAwarded: 35,
        assessment: passedAssessment([
          "learning_goal",
          "provenance",
          "core_value",
          "usable_artifact",
        ]),
      }),
    );
  }

  const currentNodeId =
    stage === "retrieval" ? "retrieval_core" : stage === "boss" ? "boss_artifact" : null;
  const journeyRecord = journey(
    journeyId,
    stage === "completed" ? "completed" : "active",
    currentNodeId,
    isPrior
      ? "Infographic cơ chế viral — branch đã hoàn thành"
      : "Infographic cơ chế viral — hành trình của tôi",
  );

  const nodeStates =
    stage === "retrieval"
      ? [
          nodeState("concept_main", "available"),
          nodeState("retrieval_core", "current"),
          nodeState("transfer_new_context", "locked"),
          nodeState("boss_artifact", "locked"),
        ]
      : stage === "boss"
        ? [
            nodeState("concept_main", "available"),
            nodeState("retrieval_core", "completed"),
            nodeState("transfer_new_context", "completed"),
            nodeState("boss_artifact", "current"),
          ]
        : [
            nodeState("concept_main", "available"),
            nodeState("retrieval_core", "completed"),
            nodeState("transfer_new_context", "completed"),
            nodeState("boss_artifact", "completed"),
          ];

  return {
    journey: journeyRecord,
    playerGraph: createStorybookPlayerGraph(stage !== "retrieval"),
    currentNodeId,
    nodeStates,
    attempts,
    mastery: [
      mastery("hook_value", stage === "retrieval" ? "exposed" : "apply"),
      mastery("network_diffusion", stage === "retrieval" ? "exposed" : "apply"),
      mastery("context_timing", stage === "retrieval" ? "exposed" : "recall"),
      mastery("remixability", stage === "retrieval" ? "exposed" : "apply"),
    ],
  };
}

function mainWorkspace(project: AnyRecord, search: AnyRecord, brew: AnyRecord): AnyRecord {
  return {
    project,
    stepper: [
      { key: "input", status: "completed" },
      { key: "search_brew", status: "completed" },
      { key: "outputs", status: "completed" },
      { key: "journey", status: "in_progress" },
      { key: "proof", status: "completed" },
    ],
    nextAction: "continue_journey",
    artifacts: [
      artifact(
        STORYBOOK_IDS.promptArtifact,
        project.id,
        "text",
        "Vì sao một bài hát có thể viral sau một đêm?",
        null,
        "ready",
        { hasMetadata: false, hasText: true, hasTranscript: false, chunkCount: 3 },
      ),
      artifact(
        STORYBOOK_IDS.videoArtifact,
        project.id,
        "youtube_url",
        "Video bài hát viral",
        "https://www.youtube.com/watch?v=viralMusic123",
        "metadata_only",
        { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 1 },
      ),
    ],
    latestSearch: search,
    latestBrewJob: brew,
  };
}

function simpleWorkspace(project: AnyRecord): AnyRecord {
  return {
    project,
    stepper: [
      { key: "input", status: "completed" },
      { key: "search_brew", status: "not_started" },
      { key: "outputs", status: "not_started" },
      { key: "journey", status: "not_started" },
      { key: "proof", status: "not_started" },
    ],
    nextAction: "run_search",
    artifacts: [
      artifact(
        "art_storybook_secondary_prompt",
        project.id,
        "text",
        String(project.title),
        null,
        "ready",
        { hasMetadata: false, hasText: true, hasTranscript: false, chunkCount: 2 },
      ),
    ],
    latestSearch: null,
    latestBrewJob: null,
  };
}

export function createGonStorybookDataset(
  variant: GonDatasetVariant = "retrieval",
): GonStorybookDataset {
  const brew = succeededBrewJob();
  const proofs = [systemProof(), sourceLinkedProof()];

  if (variant === "clarification") {
    const project = clarificationProject();
    const search = clarificationSearch();
    const projectListItem = {
      ...project,
      artifactCount: 1,
      nextAction: "answer_clarification",
    };
    return {
      projects: [project],
      projectList: [projectListItem],
      workspaceByProjectId: {
        [project.id]: {
          project,
          stepper: [
            { key: "input", status: "completed" },
            { key: "search_brew", status: "needs_decision" },
            { key: "outputs", status: "not_started" },
            { key: "journey", status: "not_started" },
            { key: "proof", status: "not_started" },
          ],
          nextAction: "answer_clarification",
          artifacts: [
            artifact(
              "art_storybook_clarification_prompt",
              project.id,
              "text",
              "Học về AI",
              null,
              "ready",
              { hasMetadata: false, hasText: true, hasTranscript: false, chunkCount: 1 },
            ),
          ],
          latestSearch: search,
          latestBrewJob: null,
        },
      },
      explorerByProjectId: { [project.id]: null },
      journeys: [],
      playersByJourneyId: {},
      progress: makeProgress(0, [], null, []),
      xpLedger: [],
      proofs: [],
      brewJob: brew,
      searchByProjectId: { [project.id]: search },
    };
  }

  const project = mainProject();
  const secondary = secondaryProject();
  const search = relatedSearch();
  const explorer = createStorybookExplorer();
  const currentPlayer = makePlayer(variant === "boss" ? "boss" : "retrieval");
  const priorPlayer = makePlayer("completed");
  const journeys = [currentPlayer.journey as AnyRecord, priorPlayer.journey as AnyRecord];

  const ledger = [...priorLedger()];
  if (variant === "boss") {
    ledger.unshift(
      ledgerEntry(11, 15, "xp.transfer_pass.v1", "att_storybook_transfer_passed", "2026-10-23T02:10:00.000Z"),
      ledgerEntry(10, 10, "xp.retrieval_pass.v1", "att_storybook_retrieval_passed", "2026-10-23T02:00:00.000Z"),
    );
  }

  const lifetimeXp = ledger.reduce((sum, entry) => sum + Number(entry.delta), 0);
  const progress = makeProgress(
    lifetimeXp,
    [
      mastery("application_context", "apply", "att_storybook_prior_transfer"),
      mastery("evidence_and_sources", "create", "att_storybook_prior_boss"),
      mastery("hook_value", variant === "boss" ? "apply" : "exposed"),
      mastery("network_diffusion", variant === "boss" ? "apply" : "exposed"),
      mastery("context_timing", variant === "boss" ? "recall" : "exposed"),
      mastery("remixability", variant === "boss" ? "apply" : "exposed"),
    ],
    proofs[0],
    [
      {
        type: "continue_journey",
        journeyId: STORYBOOK_IDS.journey,
        nodeId: currentPlayer.currentNodeId,
        title: String(currentPlayer.journey.title),
      },
    ],
  );

  return {
    projects: [project, secondary],
    projectList: [
      { ...project, artifactCount: 2, nextAction: "continue_journey" },
      { ...secondary, artifactCount: 1, nextAction: "run_search" },
    ],
    workspaceByProjectId: {
      [project.id]: mainWorkspace(project, search, brew),
      [secondary.id]: simpleWorkspace(secondary),
    },
    explorerByProjectId: {
      [project.id]: explorer,
      [secondary.id]: null,
    },
    journeys,
    playersByJourneyId: {
      [STORYBOOK_IDS.journey]: currentPlayer,
      [STORYBOOK_IDS.priorJourney]: priorPlayer,
    },
    progress,
    xpLedger: ledger,
    proofs,
    brewJob: brew,
    searchByProjectId: { [project.id]: search },
  };
}

export function createStorybookBootstrap(
  status: "onboarding" | "active",
  progress: AnyRecord,
  personalization: "granted" | "denied" | "not_set" = "granted",
): AnyRecord {
  const consent = (purpose: string, consentStatus: string) => ({
    purpose,
    status: consentStatus,
    policyVersion: "privacy-alpha-v1",
    changedAt: CREATED_AT,
  });

  return {
    account: {
      id: STORYBOOK_IDS.user,
      status,
      locale: "vi-VN",
      timeZone: "Asia/Ho_Chi_Minh",
    },
    profile: {
      userId: STORYBOOK_IDS.user,
      displayName: "Minh Anh — người học mẫu",
      selfDeclaredHeadline: "Creator học qua bằng chứng",
      version: 3,
    },
    onboarding: {
      ageAttested: status === "active",
      nextStep: status === "active" ? "none" : "redeem_invite",
    },
    consents: [
      consent("essential_service", "not_set"),
      consent("personalization_footprint", personalization),
      consent("product_analytics", "denied"),
      consent("ai_model_training", "denied"),
      consent("external_social_connection", "denied"),
    ],
    progress,
    featureFlags: {
      brew_enabled: true,
      arena_enabled: true,
      trend_enabled: false,
      game_events_enabled: false,
      internal_publish_enabled: false,
    },
  };
}
