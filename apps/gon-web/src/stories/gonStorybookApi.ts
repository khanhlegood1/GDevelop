import type { AnyRecord } from "@/lib/api";
import { progressFromXp, XP_RULE_VALUES } from "@/server/progression";
import {
  createGonStorybookDataset,
  createStorybookBootstrap,
  createStorybookExplorer,
  createStorybookPlayerGraph,
  STORYBOOK_IDS,
  type GonStorybookDataset,
} from "./gonFixtures";

export type GonStorybookScenario =
  | "signed-out"
  | "onboarding"
  | "active-retrieval"
  | "active-boss"
  | "needs-clarification"
  | "bootstrap-error"
  | "loading";

type AuthState = "signed-out" | "onboarding" | "active";
type PersonalizationState = "granted" | "denied" | "not_set";

interface GonStorybookState extends GonStorybookDataset {
  scenario: GonStorybookScenario;
  authState: AuthState;
  personalization: PersonalizationState;
  rankingMode: string;
  brewJobsById: Record<string, AnyRecord>;
  lastUpload: AnyRecord | null;
  projectSequence: number;
  artifactSequence: number;
  attemptSequence: number;
  proofSequence: number;
  xpSequence: number;
}

const MOCK_NOW = "2026-10-23T03:00:00.000Z";
const MOCK_UPDATED_AT = "2026-10-23T03:05:00.000Z";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function dataResponse<T>(data: T, status = 200): Response {
  return jsonResponse({ data: clone(data) }, status);
}

function pageResponse(items: AnyRecord[]): Response {
  return jsonResponse({
    data: clone(items),
    page: { nextCursor: null, hasMore: false },
  });
}

function problemResponse(
  status: number,
  code: string,
  title: string,
  detail: string,
  requestId = "req_storybook_mock",
): Response {
  return jsonResponse(
    {
      type: `https://gon.org/problems/${code.toLowerCase().replaceAll("_", "-")}`,
      title,
      status,
      code,
      detail,
      requestId,
    },
    status,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};
}

function asArray(value: unknown): AnyRecord[] {
  return Array.isArray(value) ? (value as AnyRecord[]) : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function datasetVariant(scenario: GonStorybookScenario) {
  if (scenario === "active-boss") return "boss" as const;
  if (scenario === "needs-clarification") return "clarification" as const;
  return "retrieval" as const;
}

function createState(scenario: GonStorybookScenario): GonStorybookState {
  const dataset = createGonStorybookDataset(datasetVariant(scenario));
  const authState: AuthState =
    scenario === "signed-out" || scenario === "loading" || scenario === "bootstrap-error"
      ? "signed-out"
      : scenario === "onboarding"
        ? "onboarding"
        : "active";

  return {
    ...dataset,
    scenario,
    authState,
    personalization: authState === "active" ? "granted" : "not_set",
    rankingMode: String(dataset.explorerByProjectId[STORYBOOK_IDS.mainProject]?.rankingSnapshot?.learningMode ?? "create_publish"),
    brewJobsById: {
      [String(dataset.brewJob.id)]: dataset.brewJob,
    },
    lastUpload: null,
    projectSequence: 0,
    artifactSequence: 0,
    attemptSequence: 0,
    proofSequence: 0,
    xpSequence: dataset.xpLedger.reduce((max, entry) => {
      const match = String(entry.id).match(/_(\d+)$/);
      return Math.max(max, match ? Number(match[1]) : 0);
    }, 9),
  };
}

function currentBootstrap(state: GonStorybookState): AnyRecord {
  if (state.authState === "onboarding") {
    return createStorybookBootstrap(
      "onboarding",
      { ...progressFromXp(0), mastery: [], latestProof: null, nextSteps: [] },
      "not_set",
    );
  }
  return createStorybookBootstrap(
    "active",
    clone(state.progress),
    state.personalization === "not_set" ? "denied" : state.personalization,
  );
}

function candidatePriority(candidate: AnyRecord, mode: string): number {
  const format = String(candidate.format);
  const priorities: Record<string, Record<string, number>> = {
    deep_mastery: {
      web_lesson: 0,
      infographic: 1,
      game: 2,
      video: 3,
      teach_back: 4,
      easy_task: 5,
    },
    apply_at_work: {
      teach_back: 0,
      easy_task: 1,
      web_lesson: 2,
      infographic: 3,
      video: 4,
      game: 5,
    },
    create_publish: {
      infographic: 0,
      game: 1,
      video: 2,
      web_lesson: 3,
      teach_back: 4,
      easy_task: 5,
    },
    prove_impact: {
      web_lesson: 0,
      game: 1,
      infographic: 2,
      video: 3,
      teach_back: 4,
      easy_task: 5,
    },
  };

  if (mode === "fast_entertaining") return Number(candidate.estimatedMinutes ?? 999);
  return priorities[mode]?.[format] ?? priorities.deep_mastery[format] ?? 99;
}

function explorerFor(state: GonStorybookState, projectId: string, requestedMode?: string | null): AnyRecord | null {
  const base = state.explorerByProjectId[projectId];
  if (!base) return null;

  const mode = requestedMode || state.rankingMode || "create_publish";
  const explorer = clone(base);
  const candidates = asArray(explorer.candidates)
    .sort((a, b) => candidatePriority(a, mode) - candidatePriority(b, mode))
    .map((candidate, index): AnyRecord => ({ ...candidate, rank: index + 1 }));

  explorer.candidates = candidates;
  explorer.rankingSnapshot = {
    ...(asRecord(explorer.rankingSnapshot)),
    id: `rank_storybook_${mode}`,
    learningMode: mode,
    personalizationApplied: state.personalization === "granted",
    orderedCandidateIds: candidates.map((candidate) => String(candidate.id)),
  };
  return explorer;
}

function syncProjectList(state: GonStorybookState): void {
  state.projectList = state.projects.map((project) => {
    const existing = state.projectList.find((item) => item.id === project.id);
    const workspace = state.workspaceByProjectId[String(project.id)];
    return {
      ...clone(project),
      artifactCount: workspace ? asArray(workspace.artifacts).length : Number(existing?.artifactCount ?? 0),
      nextAction: workspace?.nextAction ?? existing?.nextAction ?? "add_input",
    };
  });
}

function findProject(state: GonStorybookState, projectId: string): AnyRecord | undefined {
  return state.projects.find((project) => String(project.id) === projectId);
}

function graphNodes(player: AnyRecord): AnyRecord[] {
  return asArray(asRecord(player.playerGraph).nodes);
}

function graphRubrics(player: AnyRecord): AnyRecord[] {
  return asArray(asRecord(player.playerGraph).rubrics);
}

function masteryLevelRank(level: string): number {
  return { exposed: 0, recall: 1, apply: 2, create: 3, teach: 4 }[level] ?? 0;
}

function upsertMastery(list: AnyRecord[], conceptId: string, level: string, evidenceAttemptId: string): void {
  const existing = list.find((item) => String(item.conceptId) === conceptId);
  if (!existing) {
    list.push({
      conceptId,
      level,
      evidenceAttemptId,
      achievedAt: MOCK_NOW,
      reviewDueAt: null,
    });
    return;
  }
  if (masteryLevelRank(level) > masteryLevelRank(String(existing.level))) {
    existing.level = level;
    existing.evidenceAttemptId = evidenceAttemptId;
    existing.achievedAt = MOCK_NOW;
  }
}

function refreshPlayer(state: GonStorybookState, player: AnyRecord): void {
  const graph = asRecord(player.playerGraph);
  const nodes = graphNodes(player);
  const attempts = asArray(player.attempts);
  const passed = new Set(
    attempts.filter((attempt) => attempt.status === "passed").map((attempt) => String(attempt.nodeId)),
  );
  const assessedIds = new Set(
    nodes.filter((node) => Boolean(node.assessment)).map((node) => String(node.id)),
  );

  const prerequisitesByNode = new Map<string, string[]>();
  for (const edge of asArray(graph.edges)) {
    if (edge.type !== "prerequisite") continue;
    const from = String(edge.fromNodeId);
    const to = String(edge.toNodeId);
    if (!assessedIds.has(from)) continue;
    prerequisitesByNode.set(to, [...(prerequisitesByNode.get(to) ?? []), from]);
  }

  const currentNode = nodes.find((node) => {
    const nodeId = String(node.id);
    if (!node.assessment || passed.has(nodeId)) return false;
    return (prerequisitesByNode.get(nodeId) ?? []).every((id) => passed.has(id));
  });
  const currentNodeId = currentNode ? String(currentNode.id) : null;

  player.currentNodeId = currentNodeId;
  if (player.journey && typeof player.journey === "object") {
    player.journey.currentNodeId = currentNodeId;
    const allAssessedPassed = [...assessedIds].every((id) => passed.has(id));
    player.journey.status = allAssessedPassed ? "completed" : "active";
    player.journey.updatedAt = MOCK_UPDATED_AT;

    const listedJourney = state.journeys.find((journey) => String(journey.id) === String(player.journey.id));
    if (listedJourney && listedJourney !== player.journey) {
      listedJourney.currentNodeId = currentNodeId;
      listedJourney.status = player.journey.status;
      listedJourney.updatedAt = MOCK_UPDATED_AT;
    }
  }

  player.nodeStates = nodes.map((node) => {
    const nodeId = String(node.id);
    const unmet = (prerequisitesByNode.get(nodeId) ?? []).filter((id) => !passed.has(id));
    let status = "available";
    if (node.assessment && passed.has(nodeId)) status = "completed";
    else if (nodeId === currentNodeId) status = "current";
    else if (node.assessment && unmet.length > 0) status = "locked";
    return {
      id: nodeId,
      status,
      lockedReason: status === "locked" ? `requires_passed_attempt:${unmet.join(",")}` : null,
    };
  });

  const retrievalNode = nodes.find((node) => String(node.id) === "retrieval_core");
  if (retrievalNode) {
    const submitted = attempts.some(
      (attempt) => String(attempt.nodeId) === "retrieval_core" && attempt.status !== "draft",
    );
    const content = asRecord(retrievalNode.content);
    retrievalNode.content = content;
    if (submitted) {
      const sampleGraph = createStorybookPlayerGraph(true);
      const sampleNode = asArray(sampleGraph.nodes).find((node) => String(node.id) === "retrieval_core");
      const sampleAnswer = asRecord(sampleNode?.content).sampleAnswer;
      if (typeof sampleAnswer === "string") content.sampleAnswer = sampleAnswer;
    } else {
      delete content.sampleAnswer;
    }
  }
}

function recomputeProgress(state: GonStorybookState): void {
  const totalXp = state.xpLedger.reduce((sum, entry) => sum + Number(entry.delta ?? 0), 0);
  const sortedProofs = [...state.proofs].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt)),
  );
  const activeJourney = state.journeys.find((journey) => journey.status === "active");
  const currentPlayer = activeJourney
    ? state.playersByJourneyId[String(activeJourney.id)]
    : undefined;

  state.progress = {
    ...progressFromXp(totalXp),
    mastery: asArray(state.progress.mastery),
    latestProof: sortedProofs[0] ? clone(sortedProofs[0]) : null,
    nextSteps:
      activeJourney && currentPlayer?.currentNodeId
        ? [
            {
              type: "continue_journey",
              journeyId: String(activeJourney.id),
              nodeId: currentPlayer.currentNodeId,
              title: String(activeJourney.title),
            },
          ]
        : [],
  };
}

function normalizeForAssessment(value: string): string {
  return value
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(normalized: string, phrases: string[]): boolean {
  return phrases.some((phrase) => normalized.includes(normalizeForAssessment(phrase)));
}

function criterionPassed(criterionId: string, attempt: AnyRecord, normalizedAnswer: string): boolean {
  const answerLength = text(attempt.answerText).trim().length;
  const conceptGroups = [
    ["hook"],
    ["cộng đồng", "mạng lưới", "người chia sẻ"],
    ["thời điểm", "bối cảnh", "văn hóa"],
    ["remix"],
  ].filter((group) => includesAny(normalizedAnswer, group)).length;

  switch (criterionId) {
    case "covers_core_ideas":
      return answerLength >= 80 && conceptGroups >= 3;
    case "explains_limits":
      return includesAny(normalizedAnswer, ["giới hạn", "chưa đủ", "kiểm chứng", "không thể kết luận"]);
    case "own_words":
      return answerLength >= 60 && !normalizedAnswer.includes("hook chi la cua vao");
    case "new_context":
      return includesAny(normalizedAnswer, ["bối cảnh mới", "tình huống mới", "áp dụng cho"]);
    case "mechanism_fit":
      return includesAny(normalizedAnswer, ["cách áp dụng", "ap dung", "triển khai"]) && conceptGroups >= 1;
    case "evidence_plan":
      return includesAny(normalizedAnswer, ["cách đo kết quả", "đo kết quả", "kiểm chứng", "tiêu chí"]);
    case "learning_goal":
      return includesAny(normalizedAnswer, ["mục tiêu học", "muc tieu hoc"]);
    case "provenance": {
      const sources = asRecord(attempt.sourceDisclosure).sources;
      const hasSources = Array.isArray(sources) && sources.some((source) => String(source).trim().length > 0);
      const aiDisclosure = asRecord(attempt.aiAssistanceDisclosure);
      return hasSources && Object.prototype.hasOwnProperty.call(aiDisclosure, "usedAi");
    }
    case "core_value":
      return answerLength >= 180 && includesAny(normalizedAnswer, ["giá trị cốt lõi", "gia tri cot loi"]);
    case "usable_artifact":
      return (
        answerLength >= 220 &&
        includesAny(normalizedAnswer, ["nội dung artifact", "noi dung artifact"]) &&
        includesAny(normalizedAnswer, ["cách người khác sử dụng/kiểm tra", "sử dụng/kiểm tra", "kiểm tra"])
      );
    default:
      return false;
  }
}

function assessAttempt(
  state: GonStorybookState,
  player: AnyRecord,
  attempt: AnyRecord,
  node: AnyRecord,
): void {
  const rubric = graphRubrics(player).find((item) => String(item.id) === String(asRecord(node.assessment).rubricId));
  const criteria = asArray(rubric?.criteria);
  const normalized = normalizeForAssessment(text(attempt.answerText));

  const results = criteria.map((criterion) => {
    const criterionId = String(criterion.id);
    const passed = criterionPassed(criterionId, attempt, normalized);
    return {
      criterionId,
      passed,
      feedback: passed
        ? "Storybook mock ghi nhận bằng chứng cho tiêu chí này."
        : "Storybook mock chưa thấy bằng chứng đủ rõ; hãy bổ sung theo rubric đã công bố.",
    };
  });

  const passed = results.length > 0 && results.every((result) => result.passed);
  const xpRuleId = text(rubric?.xpRuleId);
  const xpAwarded = passed ? Number(XP_RULE_VALUES[xpRuleId] ?? 0) : 0;

  attempt.status = passed ? "passed" : "needs_revision";
  attempt.assessment = {
    decision: passed ? "passed" : "needs_revision",
    criteria: results,
    feedback: passed
      ? "Bài làm đạt tất cả tiêu chí bắt buộc trong mock deterministic của Storybook."
      : "Bài làm chưa đạt một hoặc nhiều tiêu chí bắt buộc trong mock deterministic của Storybook.",
    confidence: passed ? 0.9 : 0.82,
    assessorType: "deterministic",
    assessorVersion: "storybook-mock-v1",
    integritySignals: [],
  };
  attempt.xpAwarded = xpAwarded;
  attempt.submittedAt = MOCK_NOW;
  attempt.updatedAt = MOCK_NOW;

  refreshPlayer(state, player);

  if (passed && xpAwarded > 0) {
    const alreadyPosted = state.xpLedger.some((entry) => String(entry.sourceId) === String(attempt.id));
    if (!alreadyPosted) {
      state.xpSequence += 1;
      state.xpLedger.unshift({
        id: `xp_storybook_${state.xpSequence}`,
        delta: xpAwarded,
        sourceEventId: `evt_storybook_attempt_${String(attempt.id)}`,
        sourceType: "learning_attempt",
        sourceId: String(attempt.id),
        ruleVersion: xpRuleId,
        formulaVersion: "gon-level-v1",
        status: "posted",
        reversesEntryId: null,
        createdAt: MOCK_NOW,
      });
    }

    const masteryLevel =
      String(node.id) === "retrieval_core"
        ? "recall"
        : String(node.id) === "transfer_new_context"
          ? "apply"
          : "create";
    for (const conceptId of asArray(node.conceptIds).map(String)) {
      upsertMastery(asArray(player.mastery), conceptId, masteryLevel, String(attempt.id));
      upsertMastery(asArray(state.progress.mastery), conceptId, masteryLevel, String(attempt.id));
    }

    if (String(node.type) === "boss_proof") {
      const proofExists = state.proofs.some((proof) => String(proof.attemptId) === String(attempt.id));
      if (!proofExists) {
        state.proofs.unshift({
          id: `proof_storybook_mock_${String(attempt.id)}`,
          proofType: "boss_proof",
          title: `Boss Proof — ${String(asRecord(asRecord(player.playerGraph).module).title ?? "Module GON")}`,
          description: "Proof được tạo bởi mock Storybook sau khi Boss Proof đạt rubric.",
          journeyId: String(player.journey.id),
          attemptId: String(attempt.id),
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
          createdAt: MOCK_UPDATED_AT,
          updatedAt: MOCK_UPDATED_AT,
        });
      }
    }
  }

  recomputeProgress(state);
}

function createProject(state: GonStorybookState, body: AnyRecord): AnyRecord {
  state.projectSequence += 1;
  const id = `prj_storybook_created_${state.projectSequence}`;
  const prompt = text(body.prompt, "Chủ đề học mới từ Storybook");
  const project: AnyRecord = {
    id,
    title: text(body.title) || prompt.slice(0, 90),
    goal: text(body.goal, "Đạt một kết quả học quan sát được"),
    status: "draft",
    visibility: "private",
    learningMode: text(body.learningMode, "deep_mastery"),
    depth: text(body.depth, "standard"),
    timeBudgetMinutes: Number(body.timeBudgetMinutes ?? 30),
    locale: text(body.locale, "vi-VN"),
    version: 1,
    createdAt: MOCK_NOW,
    updatedAt: MOCK_NOW,
  };

  const artifactRecord: AnyRecord = {
    id: `art_storybook_created_${state.projectSequence}`,
    projectId: id,
    kind: "text",
    displayName: prompt.slice(0, 120),
    originUri: null,
    extractionStatus: "ready",
    safetyStatus: "allowed",
    coverage: { hasMetadata: false, hasText: true, hasTranscript: false, chunkCount: 2 },
    createdAt: MOCK_NOW,
    version: 1,
  };

  state.projects.unshift(project);
  state.workspaceByProjectId[id] = {
    project,
    stepper: [
      { key: "input", status: "completed" },
      { key: "search_brew", status: "not_started" },
      { key: "outputs", status: "not_started" },
      { key: "journey", status: "not_started" },
      { key: "proof", status: "not_started" },
    ],
    nextAction: "run_search",
    artifacts: [artifactRecord],
    latestSearch: null,
    latestBrewJob: null,
  };
  state.explorerByProjectId[id] = null;
  syncProjectList(state);
  return project;
}

function relatedSearchFor(project: AnyRecord): AnyRecord {
  if (String(project.id) === STORYBOOK_IDS.mainProject) {
    return clone(createGonStorybookDataset("retrieval").searchByProjectId[STORYBOOK_IDS.mainProject]);
  }
  if (String(project.id) === STORYBOOK_IDS.clarificationProject) {
    return clone(createGonStorybookDataset("clarification").searchByProjectId[STORYBOOK_IDS.clarificationProject]);
  }
  return {
    id: `search_storybook_${String(project.id)}`,
    projectId: String(project.id),
    status: "completed",
    verdict: "related",
    matchedConcepts: ["Concept cốt lõi từ input"],
    missingConcepts: ["Artifact áp dụng cho bối cảnh của người học"],
    clarificationQuestions: [],
    results: [
      {
        moduleVersionId: STORYBOOK_IDS.moduleVersion,
        rank: 1,
        title: "Module liên quan trong fixture Storybook",
        sourceStatus: "partially_cited",
        reasonCodes: ["same_core_concepts", "partially_cited_sources"],
        matchedConcepts: ["Concept cốt lõi từ input"],
        missingConcepts: ["Artifact áp dụng cho bối cảnh của người học"],
      },
    ],
  };
}

async function readJsonBody(input: RequestInfo | URL, init?: RequestInit): Promise<AnyRecord> {
  if (typeof init?.body === "string") {
    try {
      return asRecord(JSON.parse(init.body));
    } catch {
      return {};
    }
  }
  if (input instanceof Request) {
    try {
      return asRecord(await input.clone().json());
    } catch {
      return {};
    }
  }
  return {};
}

function requestUrl(input: RequestInfo | URL): URL {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return new URL(raw, globalThis.location?.origin ?? "http://storybook.local");
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  return String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

export function installGonStorybookApi(scenario: GonStorybookScenario): () => void {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const state = createState(scenario);

  const mockFetch: typeof fetch = async (input, init) => {
    const url = requestUrl(input);
    const pathname = url.pathname;
    const method = requestMethod(input, init);
    const segments = pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));

    if (!pathname.startsWith("/v1/") && !pathname.startsWith("/api/")) {
      return originalFetch(input, init);
    }

    if (pathname === "/api/csrf" && method === "GET") {
      return dataResponse({ csrfToken: "storybook-csrf-token" });
    }

    if (pathname.startsWith("/api/local-uploads/")) {
      return new Response(null, { status: 204 });
    }

    if (pathname === "/api/dev/session") {
      if (method === "POST") {
        if (state.authState === "signed-out") state.authState = "onboarding";
        return dataResponse({ ok: true, mode: "storybook-mock" });
      }
      if (method === "DELETE") {
        state.authState = "signed-out";
        return dataResponse({ ok: true });
      }
    }

    if (pathname === "/v1/me/bootstrap" && method === "GET") {
      if (scenario === "loading") await sleep(8_000);
      if (scenario === "bootstrap-error") {
        return problemResponse(
          503,
          "STORYBOOK_BOOTSTRAP_UNAVAILABLE",
          "Bootstrap tạm thời không khả dụng",
          "Storybook mock đang mô phỏng lỗi bootstrap để kiểm tra trạng thái lỗi của giao diện.",
          "req_storybook_bootstrap_error",
        );
      }
      if (state.authState === "signed-out") {
        return problemResponse(
          401,
          "UNAUTHORIZED",
          "Cần đăng nhập",
          "Storybook mock chưa có phiên đăng nhập.",
          "req_storybook_signed_out",
        );
      }
      return dataResponse(currentBootstrap(state));
    }

    const body = method === "GET" ? {} : await readJsonBody(input, init);

    if (pathname === "/v1/me/age-attestation" && method === "POST") {
      const personalization = body.personalizationFootprint;
      state.personalization = personalization === "granted" ? "granted" : "denied";
      state.authState = "active";
      return dataResponse({
        id: "attest_storybook",
        method: "self_attested_18_plus",
        termsVersion: text(body.termsVersion, "terms-alpha-v1"),
        privacyVersion: text(body.privacyVersion, "privacy-alpha-v1"),
        attestedAt: MOCK_NOW,
      }, 201);
    }

    if (state.authState !== "active" && pathname.startsWith("/v1/")) {
      return problemResponse(
        state.authState === "signed-out" ? 401 : 403,
        state.authState === "signed-out" ? "UNAUTHORIZED" : "ONBOARDING_REQUIRED",
        "Tài khoản chưa sẵn sàng",
        "Storybook mock yêu cầu hoàn tất onboarding trước khi gọi endpoint này.",
      );
    }

    if (pathname === "/v1/projects" && method === "GET") {
      syncProjectList(state);
      return pageResponse(state.projectList);
    }

    if (pathname === "/v1/projects" && method === "POST") {
      return dataResponse(createProject(state, body), 201);
    }

    if (pathname === "/v1/me/progress" && method === "GET") {
      recomputeProgress(state);
      return dataResponse(state.progress);
    }

    if (pathname === "/v1/me/xp-ledger" && method === "GET") {
      return pageResponse(state.xpLedger);
    }

    if (pathname === "/v1/journeys" && method === "GET") {
      return pageResponse(state.journeys);
    }

    if (pathname === "/v1/proofs" && method === "GET") {
      return pageResponse(state.proofs);
    }

    if (pathname === "/v1/proofs" && method === "POST") {
      state.proofSequence += 1;
      const externalUri = text(body.externalUri).trim();
      const artifactIds = Array.isArray(body.artifactIds) ? body.artifactIds.map(String) : [];
      const verificationLevel = externalUri || artifactIds.length > 0 ? "source_linked" : "self_declared";
      const proof: AnyRecord = {
        id: `proof_storybook_created_${state.proofSequence}`,
        proofType: text(body.proofType, "certificate_link"),
        title: text(body.title, "Proof từ Storybook"),
        description: text(body.description) || null,
        journeyId: null,
        attemptId: null,
        artifactIds,
        issuerDisplayName: text(body.issuerDisplayName) || null,
        externalReference: externalUri || null,
        verificationLevel,
        status: "active",
        visibility: "private",
        proves:
          verificationLevel === "source_linked"
            ? ["Người dùng đã liên kết một nguồn/artifact với tuyên bố học tập này trong Proof Vault."]
            : ["Người dùng tự khai bằng chứng này trong Proof Vault."],
        doesNotProve: [
          "GON chưa đối chiếu issuer hoặc chữ ký bên ngoài trong mock này.",
          "Proof ngoài không tự cộng XP và không phải Issuer-verified.",
        ],
        version: 1,
        createdAt: MOCK_UPDATED_AT,
        updatedAt: MOCK_UPDATED_AT,
      };
      state.proofs.unshift(proof);
      recomputeProgress(state);
      return dataResponse(proof, 201);
    }

    if (pathname === "/v1/reports" && method === "POST") {
      return dataResponse({ id: "rep_storybook", status: "received", ...body }, 201);
    }

    if (segments[0] === "v1" && segments[1] === "brew-jobs" && segments[2] && method === "GET") {
      const job = state.brewJobsById[segments[2]];
      return job
        ? dataResponse(job)
        : problemResponse(404, "BREW_JOB_NOT_FOUND", "Không tìm thấy Brew job", "Storybook mock không có Brew job này.");
    }

    if (segments[0] === "v1" && segments[1] === "projects" && segments[2]) {
      const projectId = segments[2];
      const project = findProject(state, projectId);
      if (!project) {
        return problemResponse(404, "PROJECT_NOT_FOUND", "Không tìm thấy project", "Storybook mock không có project này.");
      }
      const workspace = state.workspaceByProjectId[projectId];

      if (segments[3] === "workspace" && method === "GET") {
        return workspace
          ? dataResponse(workspace)
          : problemResponse(404, "PROJECT_NOT_FOUND", "Không tìm thấy workspace", "Storybook mock không có workspace này.");
      }

      if (segments[3] === "output-explorer" && method === "GET") {
        const explorer = explorerFor(state, projectId, url.searchParams.get("mode"));
        return explorer
          ? dataResponse(explorer)
          : problemResponse(
              409,
              "CANDIDATE_SET_NOT_READY",
              "Chưa có Output Candidate",
              "Hãy chạy Search hoặc Brew để tạo CandidateSet trước.",
              "req_storybook_candidate_not_ready",
            );
      }

      if (segments[3] === "search-attempts" && method === "POST") {
        const search = relatedSearchFor(project);
        state.searchByProjectId[projectId] = search;
        if (workspace) {
          workspace.latestSearch = search;
          const step = asArray(workspace.stepper).find((item) => item.key === "search_brew");
          if (step) step.status = search.verdict === "needs_clarification" ? "needs_decision" : "completed";
          workspace.nextAction =
            search.verdict === "needs_clarification" ? "answer_clarification" : "confirm_brew";
        }
        project.status = search.verdict === "needs_clarification" ? "needs_decision" : "needs_decision";
        syncProjectList(state);
        return dataResponse(search, 202);
      }

      if (segments[3] === "brew-jobs" && method === "POST") {
        const job = {
          ...clone(state.brewJob),
          id: projectId === STORYBOOK_IDS.mainProject ? STORYBOOK_IDS.brewJob : `job_storybook_${projectId}`,
          projectId,
          searchAttemptId: text(body.searchAttemptId, String(state.searchByProjectId[projectId]?.id ?? "")),
          status: "succeeded",
          currentStep: "succeeded",
          completedAt: MOCK_NOW,
        };
        state.brewJobsById[String(job.id)] = job;
        if (workspace) {
          workspace.latestBrewJob = job;
          const outputsStep = asArray(workspace.stepper).find((item) => item.key === "outputs");
          if (outputsStep) outputsStep.status = "completed";
          workspace.nextAction = "choose_learning_path";
        }
        if (!state.explorerByProjectId[projectId]) {
          const explorer = createStorybookExplorer(String(project.learningMode ?? "create_publish"));
          explorer.projectId = projectId;
          state.explorerByProjectId[projectId] = explorer;
        }
        project.status = "ready";
        syncProjectList(state);
        return dataResponse(job, 202);
      }

      if (segments[3] === "ranking-snapshots" && method === "POST") {
        state.rankingMode = text(body.learningMode, state.rankingMode);
        const explorer = explorerFor(state, projectId, state.rankingMode);
        return explorer
          ? dataResponse(explorer.rankingSnapshot, 201)
          : problemResponse(409, "CANDIDATE_SET_NOT_READY", "Chưa có Output Candidate", "Không thể tạo ranking snapshot.");
      }

      if (segments[3] === "artifacts" && method === "POST" && !segments[4]) {
        state.artifactSequence += 1;
        const kind = text(body.kind, "website_url");
        const newArtifact: AnyRecord = {
          id: `art_storybook_added_${state.artifactSequence}`,
          projectId,
          kind,
          displayName: text(body.displayName) || text(body.uri) || "Artifact từ Storybook",
          originUri: text(body.uri) || null,
          extractionStatus: kind === "text" ? "ready" : "metadata_only",
          safetyStatus: "allowed",
          coverage:
            kind === "text"
              ? { hasMetadata: false, hasText: true, hasTranscript: false, chunkCount: 1 }
              : { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 0 },
          createdAt: MOCK_NOW,
          version: 1,
        };
        if (workspace) asArray(workspace.artifacts).push(newArtifact);
        syncProjectList(state);
        return dataResponse(newArtifact, 202);
      }

      if (segments[3] === "artifacts" && segments[4] === "uploads" && method === "POST") {
        state.artifactSequence += 1;
        const artifactId = `art_storybook_upload_${state.artifactSequence}`;
        state.lastUpload = {
          artifactId,
          projectId,
          kind: text(body.kind, "file"),
          fileName: text(body.fileName, "storybook-upload.txt"),
          declaredMimeType: text(body.declaredMimeType, "text/plain"),
        };
        return dataResponse({
          artifactId,
          method: "PUT",
          uploadUrl: `/api/local-uploads/storybook/${artifactId}?token=storybook`,
          headers: { "Content-Type": text(body.declaredMimeType, "text/plain") },
          expiresAt: "2026-10-23T04:00:00.000Z",
        }, 201);
      }

      if (segments[3] === "artifacts" && segments[4]?.endsWith(":complete-upload") && method === "POST") {
        const artifactId = segments[4].slice(0, -":complete-upload".length);
        const upload = state.lastUpload ?? {};
        const mime = text(upload.declaredMimeType, "text/plain");
        const isText = mime.startsWith("text/") || ["application/json", "text/csv", "text/markdown"].includes(mime);
        const completedArtifact: AnyRecord = {
          id: artifactId,
          projectId,
          kind: text(upload.kind, "file"),
          displayName: text(upload.fileName, "storybook-upload.txt"),
          originUri: null,
          extractionStatus: isText ? "ready" : "metadata_only",
          safetyStatus: "allowed",
          coverage: isText
            ? { hasMetadata: true, hasText: true, hasTranscript: false, chunkCount: 1 }
            : { hasMetadata: true, hasText: false, hasTranscript: false, chunkCount: 0 },
          createdAt: MOCK_NOW,
          version: 2,
        };
        if (workspace) {
          const artifacts = asArray(workspace.artifacts);
          const existingIndex = artifacts.findIndex((item) => String(item.id) === artifactId);
          if (existingIndex >= 0) artifacts[existingIndex] = completedArtifact;
          else artifacts.push(completedArtifact);
        }
        syncProjectList(state);
        return dataResponse(completedArtifact, 202);
      }
    }

    if (segments[0] === "v1" && segments[1] === "journeys") {
      if (method === "POST" && segments.length === 2) {
        const candidateId = text(body.candidateId);
        const existing = state.journeys.find(
          (journey) => String(journey.sourceCandidateId) === candidateId && journey.status === "active",
        ) ?? state.journeys.find((journey) => journey.status === "active") ?? state.journeys[0];
        return existing
          ? dataResponse(existing, 201)
          : problemResponse(404, "JOURNEY_NOT_FOUND", "Không tìm thấy journey", "Storybook mock không có journey khả dụng.");
      }

      const journeyId = segments[2];
      const player = journeyId ? state.playersByJourneyId[journeyId] : undefined;

      if (journeyId && segments[3] === "player" && method === "GET") {
        if (!player) {
          return problemResponse(404, "JOURNEY_NOT_FOUND", "Không tìm thấy journey", "Storybook mock không có player này.");
        }
        refreshPlayer(state, player);
        return dataResponse(player);
      }

      if (journeyId && segments[3] === "attempts") {
        if (!player) {
          return problemResponse(404, "JOURNEY_NOT_FOUND", "Không tìm thấy journey", "Storybook mock không có player này.");
        }

        if (method === "POST" && segments.length === 4) {
          const nodeId = text(body.nodeId);
          const node = graphNodes(player).find((item) => String(item.id) === nodeId);
          if (!node?.assessment) {
            return problemResponse(422, "NODE_NOT_ASSESSABLE", "Node không có bài nộp", "Node này không có assessment.");
          }
          state.attemptSequence += 1;
          const attemptNumber = asArray(player.attempts).filter((attempt) => String(attempt.nodeId) === nodeId).length + 1;
          const newAttempt: AnyRecord = {
            id: `att_storybook_mock_${state.attemptSequence}`,
            journeyId,
            moduleVersionId: STORYBOOK_IDS.moduleVersion,
            nodeId,
            status: "draft",
            attemptNumber,
            answerText: null,
            artifactIds: [],
            rubricId: String(asRecord(node.assessment).rubricId),
            rubricVersion: "1.0",
            assessment: null,
            xpAwarded: 0,
            version: 1,
            sourceDisclosure: {},
            aiAssistanceDisclosure: {},
            createdAt: MOCK_NOW,
            updatedAt: MOCK_NOW,
            submittedAt: null,
          };
          asArray(player.attempts).push(newAttempt);
          refreshPlayer(state, player);
          return dataResponse(newAttempt, 201);
        }

        const attemptSegment = segments[4] ?? "";
        const isSubmit = attemptSegment.endsWith(":submit");
        const attemptId = isSubmit ? attemptSegment.slice(0, -":submit".length) : attemptSegment;
        const attempt = asArray(player.attempts).find((item) => String(item.id) === attemptId);

        if (!attempt) {
          return problemResponse(404, "ATTEMPT_NOT_FOUND", "Không tìm thấy attempt", "Storybook mock không có attempt này.");
        }

        if (method === "PATCH" && !isSubmit) {
          attempt.answerText = text(body.answerText);
          attempt.artifactIds = Array.isArray(body.artifactIds) ? body.artifactIds.map(String) : [];
          attempt.sourceDisclosure = asRecord(body.sourceDisclosure);
          attempt.aiAssistanceDisclosure = asRecord(body.aiAssistanceDisclosure);
          attempt.version = Number(attempt.version ?? 1) + 1;
          attempt.updatedAt = MOCK_UPDATED_AT;
          return dataResponse(attempt);
        }

        if (method === "POST" && isSubmit) {
          const node = graphNodes(player).find((item) => String(item.id) === String(attempt.nodeId));
          if (!node) {
            return problemResponse(422, "ASSESSMENT_CONTRACT_INVALID", "Thiếu node assessment", "Storybook mock không tìm thấy node.");
          }
          assessAttempt(state, player, attempt, node);
          return dataResponse(attempt, 202);
        }
      }
    }

    return problemResponse(
      501,
      "STORYBOOK_MOCK_NOT_IMPLEMENTED",
      "Endpoint chưa có mock",
      `Storybook mock chưa triển khai ${method} ${pathname}.`,
      "req_storybook_unmocked",
    );
  };

  globalThis.fetch = mockFetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}
