"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import {
  apiPage,
  apiRequest,
  ApiClientError,
  resolveUploadRequest,
  sha256Hex,
  type AnyRecord,
} from "@/lib/api";
import { ArenaPanel } from "@/components/gon/ArenaPanel";
import { JourneyAgentPanel } from "@/components/gon/JourneyAgentPanel";
import { KolPathCard } from "@/components/gon/KolPathCard";

const TERMS_VERSION = "terms-alpha-v1";
const PRIVACY_VERSION = "privacy-alpha-v1";

type View = "start" | "outputs" | "learn" | "progress" | "proofs" | "arena";

const LEARNING_MODES = [
  { value: "deep_mastery", label: "Deep Mastery", description: "Đi sâu, ưu tiên độ bao phủ concept và nguồn." },
  { value: "apply_at_work", label: "Apply at Work", description: "Áp dụng vào công việc/tình huống thật." },
  { value: "create_publish", label: "Create / Publish", description: "Tạo artifact có thể dạy lại hoặc xuất bản sau review." },
  { value: "fast_entertaining", label: "Fast & Entertaining", description: "Ngắn, nhẹ, nhưng vẫn có kiểm tra hiểu thật." },
  { value: "prove_impact", label: "Prove & Impact", description: "Tập trung bằng chứng và tác động có thể kiểm chứng." },
] as const;

const VERDICT_LABELS: Record<string, { label: string; tone: string; description: string }> = {
  found: {
    label: "Đã tìm thấy hướng học phù hợp",
    tone: "success",
    description: "Kho nội dung bạn được phép xem đã có module khớp mạnh với mục tiêu.",
  },
  related: {
    label: "Có nội dung liên quan, chưa đủ hoàn toàn",
    tone: "warning",
    description: "Bạn có thể học phần sẵn có hoặc Brew phần còn thiếu; GON không gọi đây là khớp hoàn toàn.",
  },
  missing: {
    label: "Chưa có module đủ phù hợp",
    tone: "warning",
    description: "Đây không phải trang trống: hãy xác nhận Brew Your Topic để tạo bản nháp riêng tư từ bằng chứng của bạn.",
  },
  needs_clarification: {
    label: "Cần làm rõ mục tiêu",
    tone: "info",
    description: "Input còn quá mơ hồ hoặc chưa có artifact dùng được. Hãy bổ sung trọng tâm/nguồn rồi tìm lại.",
  },
  blocked_by_policy: {
    label: "Input bị chặn bởi policy",
    tone: "danger",
    description: "Hãy thay artifact hoặc diễn đạt lại yêu cầu theo cách an toàn hơn.",
  },
};

const REASON_LABELS: Record<string, string> = {
  high_relevance: "Rất sát input",
  strong_concept_coverage: "Bao phủ concept tốt",
  fits_learning_mode: "Hợp Learning Mode",
  fits_time_budget: "Hợp thời gian",
  source_checked: "Nguồn đã kiểm chứng",
  partially_cited_sources: "Đã gắn nguồn một phần",
  matches_learning_history: "Khớp lịch sử học trong GON",
  same_core_concepts: "Cùng concept lõi",
  same_source_topic: "Cùng chủ đề nguồn",
  missing_artifact_outcome: "Còn thiếu outcome",
  source_needs_review: "Nguồn cần review",
};

const MASTERY_LABELS: Record<string, string> = {
  exposed: "Exposed · Đã tiếp xúc",
  recall: "Recall · Truy hồi được",
  apply: "Apply · Áp dụng được",
  create: "Create · Tạo được bằng chứng",
  teach: "Teach · Dạy lại được",
};

function asArray<T = AnyRecord>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function formatDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isActiveBrewStatus(status: unknown): boolean {
  return ["queued", "running", "failed_retryable"].includes(String(status));
}

function statusTone(status: string): string {
  if (["ready", "passed", "completed", "succeeded", "active", "allowed"].includes(status)) return "success";
  if (["metadata_only", "partial", "needs_decision", "needs_revision", "pending_human_review", "ready_with_shortfall"].includes(status)) return "warning";
  if (["blocked", "failed_terminal", "failed", "rejected"].includes(status)) return "danger";
  if (["processing", "queued", "running", "submitted", "assessing", "pending_scan"].includes(status)) return "info";
  return "";
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiClientError) {
    return error.requestId ? `${error.message} (requestId: ${error.requestId})` : error.message;
  }
  return error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";
}

function nodeTabId(nodeId: string): string {
  return `node-tab-${nodeId.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

interface Vs1AppProps {
  googleConfigured: boolean;
  devAuthEnabled: boolean;
  devInviteHint?: string;
}

export function Vs1App({ googleConfigured, devAuthEnabled, devInviteHint }: Vs1AppProps) {
  const [initialLoading, setInitialLoading] = useState(true);
  const [bootstrap, setBootstrap] = useState<AnyRecord | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [inviteCode, setInviteCode] = useState(devInviteHint ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState<View>("start");

  const [devName, setDevName] = useState("Người học Alpha");
  const [personalization, setPersonalization] = useState<"granted" | "denied">("denied");

  const [projects, setProjects] = useState<AnyRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<AnyRecord | null>(null);
  const [search, setSearch] = useState<AnyRecord | null>(null);
  const [brewJob, setBrewJob] = useState<AnyRecord | null>(null);
  const [explorer, setExplorer] = useState<AnyRecord | null>(null);
  const [rankingMode, setRankingMode] = useState<string>("deep_mastery");

  const [prompt, setPrompt] = useState("");
  const [goal, setGoal] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const [learningMode, setLearningMode] = useState<string>("deep_mastery");
  const [depth, setDepth] = useState("standard");
  const [timeBudget, setTimeBudget] = useState(30);
  const [urlValue, setUrlValue] = useState("");
  const [urlKind, setUrlKind] = useState("website_url");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [journeys, setJourneys] = useState<AnyRecord[]>([]);
  const [player, setPlayer] = useState<AnyRecord | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [bossSources, setBossSources] = useState("");
  const [bossChanges, setBossChanges] = useState("");
  const [bossUsedAi, setBossUsedAi] = useState(true);
  const [bossAiDescription, setBossAiDescription] = useState("GON hỗ trợ tổ chức module; tôi tự viết phần áp dụng và artifact.");

  const [progress, setProgress] = useState<AnyRecord | null>(null);
  const [ledger, setLedger] = useState<AnyRecord[]>([]);
  const [proofs, setProofs] = useState<AnyRecord[]>([]);
  const [proofTitle, setProofTitle] = useState("");
  const [proofType, setProofType] = useState("certificate_link");
  const [proofUri, setProofUri] = useState("");
  const [proofIssuer, setProofIssuer] = useState("");
  const [proofDescription, setProofDescription] = useState("");

  const [reportReason, setReportReason] = useState("source_quality");
  const [reportDetail, setReportDetail] = useState("");

  const accountStatus = bootstrap?.account?.status as string | undefined;
  const isActive = accountStatus === "active";
  const currentProgress = (progress ?? bootstrap?.progress) as AnyRecord | undefined;

  function handleNodeTabsKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]:not(:disabled)'),
    );
    const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0 || tabs.length === 0) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    const nextNodeId = nextTab.dataset.nodeId;
    if (nextNodeId) setActiveNodeId(nextNodeId);
    nextTab.focus();
  }

  async function run<T>(label: string, task: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError(null);
    try {
      return await task();
    } catch (caught) {
      setError(errorMessage(caught));
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function loadProgressAndProofs() {
    const [progressData, ledgerData, proofData, journeyData] = await Promise.all([
      apiRequest<AnyRecord>("/v1/me/progress"),
      apiPage<AnyRecord>("/v1/me/xp-ledger?limit=50"),
      apiPage<AnyRecord>("/v1/proofs?limit=50"),
      apiPage<AnyRecord>("/v1/journeys?limit=50"),
    ]);
    setProgress(progressData);
    setLedger(ledgerData.data);
    setProofs(proofData.data);
    setJourneys(journeyData.data);
    return journeyData.data;
  }

  async function loadPlayer(journeyId: string) {
    const data = await apiRequest<AnyRecord>(`/v1/journeys/${journeyId}/player`);
    setPlayer(data);
    const graph = data.playerGraph as AnyRecord;
    const nodes = asArray<AnyRecord>(graph?.nodes);
    setActiveNodeId((current) => {
      if (current && nodes.some((node) => node.id === current)) return current;
      return typeof data.currentNodeId === "string" ? data.currentNodeId : String(nodes[0]?.id ?? "");
    });
    return data;
  }

  async function loadProjectWorkspace(projectId: string, journeyList: AnyRecord[] = journeys) {
    const data = await apiRequest<AnyRecord>(`/v1/projects/${projectId}/workspace`);
    setWorkspace(data);
    setSearch((data.latestSearch as AnyRecord | null) ?? null);
    setBrewJob((data.latestBrewJob as AnyRecord | null) ?? null);
    setRankingMode(String(data.project?.learningMode ?? "deep_mastery"));

    try {
      const explorerData = await apiRequest<AnyRecord>(`/v1/projects/${projectId}/output-explorer`);
      setExplorer(explorerData);
    } catch (caught) {
      if (!(caught instanceof ApiClientError && caught.status === 409)) throw caught;
      setExplorer(null);
    }

    const projectJourney = journeyList.find((journey) => journey.projectId === projectId && journey.status !== "deleted");
    if (projectJourney) {
      await loadPlayer(String(projectJourney.id));
    }
    return data;
  }

  async function loadActiveData(nextBootstrap: AnyRecord) {
    const [projectPage, journeyList] = await Promise.all([
      apiPage<AnyRecord>("/v1/projects?limit=30"),
      loadProgressAndProofs(),
    ]);
    setProjects(projectPage.data);
    const nextProjectId = typeof projectPage.data[0]?.id === "string" ? String(projectPage.data[0].id) : null;
    if (nextProjectId) {
      setSelectedProjectId(nextProjectId);
      await loadProjectWorkspace(nextProjectId, journeyList);
    }
    setBootstrap(nextBootstrap);
  }

  async function loadBootstrap() {
    try {
      const data = await apiRequest<AnyRecord>("/v1/me/bootstrap");
      setSignedOut(false);
      setBootstrap(data);
      if (data.account?.status === "active") await loadActiveData(data);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        setSignedOut(true);
        setBootstrap(null);
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      setInitialLoading(false);
    }
  }

  useEffect(() => {
    void loadBootstrap();
    // The bootstrap loader intentionally owns its one-time initialization.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDevSignIn(event: FormEvent) {
    event.preventDefault();
    await run("dev-sign-in", async () => {
      await apiRequest("/api/dev/session", { method: "POST", body: { displayName: devName } });
      setSignedOut(false);
      await loadBootstrap();
      setNotice("Đã tạo phiên dev local. Hãy hoàn tất invite để kích hoạt tài khoản.");
    });
  }

  async function handleAttestation(event: FormEvent) {
    event.preventDefault();
    // PO 24/10/2026: đảo ngược định vị 18+ — "toàn bộ dự án không quan tâm user
    // có trên 18 tuổi hay không". FE không còn cổng độ tuổi. Payload attestation
    // GIỮ NGUYÊN theo contract P03 đã khoá (isAtLeast18/termsVersion/privacyVersion).
    await run("attestation", async () => {
      await apiRequest("/v1/me/age-attestation", {
        method: "POST",
        body: {
          isAtLeast18: true,
          termsVersion: TERMS_VERSION,
          privacyVersion: PRIVACY_VERSION,
          personalizationFootprint: personalization,
          ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
        },
      });
      const data = await apiRequest<AnyRecord>("/v1/me/bootstrap");
      setBootstrap(data);
      await loadActiveData(data);
      setNotice("Tài khoản đã active. Không có cổng độ tuổi (quyết định PO 24/10) — payload attestation giữ nguyên contract P03.");
    });
  }

  async function handleSignOut() {
    if (devAuthEnabled) {
      await run("sign-out", async () => {
        await apiRequest("/api/dev/session", { method: "DELETE", idempotency: false });
        globalThis.location.reload();
      });
      return;
    }
    globalThis.location.href = "/api/auth/signout?callbackUrl=%2F";
  }

  async function uploadSelectedFile(projectId: string, file: File) {
    const hash = await sha256Hex(file);
    const kind = file.type.startsWith("image/") ? "image" : "file";
    const session = await apiRequest<AnyRecord>(`/v1/projects/${projectId}/artifacts/uploads`, {
      method: "POST",
      body: {
        kind,
        fileName: file.name,
        declaredMimeType: file.type || (kind === "image" ? "image/png" : "text/plain"),
        byteSize: file.size,
        sha256: hash,
        rightsBasis: "created_by_user",
      },
    });
    const uploadMethod = String(session.method ?? "PUT").toUpperCase();
    if (uploadMethod !== "PUT") throw new Error(`Upload method ${uploadMethod} chưa được hỗ trợ.`);
    const uploadRequest = resolveUploadRequest(String(session.uploadUrl));
    const uploadResponse = await fetch(uploadRequest.url, {
      method: "PUT",
      credentials: uploadRequest.credentials,
      headers: session.headers as Record<string, string>,
      body: file,
    });
    if (!uploadResponse.ok) throw new Error(`Upload file thất bại với HTTP ${uploadResponse.status}.`);
    return apiRequest<AnyRecord>(`/v1/projects/${projectId}/artifacts/${String(session.artifactId)}:complete-upload`, {
      method: "POST",
      body: { sha256: hash, byteSize: file.size },
    });
  }

  async function refreshProjects(selectedId?: string) {
    const page = await apiPage<AnyRecord>("/v1/projects?limit=30");
    setProjects(page.data);
    if (selectedId) setSelectedProjectId(selectedId);
  }

  async function runSearch(projectId: string) {
    const data = await apiRequest<AnyRecord>(`/v1/projects/${projectId}/search-attempts`, {
      method: "POST",
      body: {},
    });
    setSearch(data);
    await loadProjectWorkspace(projectId);
    if (data.verdict === "found") setView("outputs");
    return data;
  }

  async function handleCreateProject(event: FormEvent) {
    event.preventDefault();
    await run("create-project", async () => {
      const project = await apiRequest<AnyRecord>("/v1/projects", {
        method: "POST",
        body: {
          ...(projectTitle.trim() ? { title: projectTitle.trim() } : {}),
          prompt,
          goal,
          learningMode,
          depth,
          timeBudgetMinutes: timeBudget,
          locale: "vi-VN",
        },
      });
      const projectId = String(project.id);
      setSelectedProjectId(projectId);
      await refreshProjects(projectId);

      if (urlValue.trim()) {
        await apiRequest(`/v1/projects/${projectId}/artifacts`, {
          method: "POST",
          body: {
            kind: urlKind,
            uri: urlValue.trim(),
            rightsBasis: "publicly_available_link",
          },
        });
      }
      if (selectedFile) await uploadSelectedFile(projectId, selectedFile);

      const searchResult = await runSearch(projectId);
      setNotice(`Search hoàn tất với verdict “${String(searchResult?.verdict ?? "unknown")}”.`);
      setSelectedFile(null);
    });
  }

  async function handleSelectProject(projectId: string) {
    setSelectedProjectId(projectId);
    await run("load-project", async () => {
      const journeyList = await loadProgressAndProofs();
      await loadProjectWorkspace(projectId, journeyList);
    });
  }

  async function handleBrew() {
    if (!selectedProjectId || !search?.id) return;
    await run("brew", async () => {
      let data = await apiRequest<AnyRecord>(`/v1/projects/${selectedProjectId}/brew-jobs`, {
        method: "POST",
        body: { searchAttemptId: String(search.id), confirmed: true },
      });
      setBrewJob(data);

      // Inline mode normally returns a terminal state immediately. In queued
      // mode the durable job is the source of truth, so poll its public DTO
      // for a bounded period instead of treating `queued` as a failure.
      for (let poll = 0; poll < 90 && isActiveBrewStatus(data.status); poll += 1) {
        setNotice(
          data.status === "failed_retryable"
            ? "Brew gặp lỗi tạm thời và đang chờ worker thử lại theo lịch durable job."
            : "Brew đã vào hàng đợi durable; GON đang chờ worker xử lý.",
        );
        await sleep(2_000);
        data = await apiRequest<AnyRecord>(`/v1/brew-jobs/${String(data.id)}`);
        setBrewJob(data);
      }

      await loadProjectWorkspace(selectedProjectId);
      if (data.status === "succeeded") {
        setView("outputs");
        setNotice("Brew đã tạo ModuleVersion draft_private và Candidate Outputs. Module chưa được publish cho người khác.");
      } else if (isActiveBrewStatus(data.status)) {
        setNotice(
          `Brew vẫn ở trạng thái ${String(data.status)}. Job đã được lưu durable; bạn có thể tải lại workspace sau khi worker xử lý.`,
        );
      } else {
        setNotice(`Brew kết thúc ở trạng thái ${String(data.status)}${data.failureCode ? ` (${String(data.failureCode)})` : ""}.`);
      }
    });
  }

  async function handleRankingMode(mode: string) {
    setRankingMode(mode);
    if (!selectedProjectId || !explorer?.candidateSet?.id) return;
    await run("ranking", async () => {
      await apiRequest(`/v1/projects/${selectedProjectId}/ranking-snapshots`, {
        method: "POST",
        body: { candidateSetId: String(explorer.candidateSet.id), learningMode: mode },
      });
      const data = await apiRequest<AnyRecord>(`/v1/projects/${selectedProjectId}/output-explorer?mode=${encodeURIComponent(mode)}`);
      setExplorer(data);
    });
  }

  async function handleFork(candidate: AnyRecord) {
    await run("fork", async () => {
      const journey = await apiRequest<AnyRecord>("/v1/journeys", {
        method: "POST",
        body: { candidateId: String(candidate.id), ifExists: "return_existing" },
      });
      await loadProgressAndProofs();
      await loadPlayer(String(journey.id));
      setView("learn");
      setNotice("Đã tạo Journey Fork riêng tư. Branch khóa upstream ModuleVersion và giữ attribution.");
    });
  }

  const graph = (player?.playerGraph ?? null) as AnyRecord | null;
  const graphNodes = useMemo(() => asArray<AnyRecord>(graph?.nodes), [graph]);
  const activeNode = graphNodes.find((node) => node.id === activeNodeId) ?? graphNodes[0] ?? null;
  const nodeStateById = useMemo(() => {
    const map = new Map<string, AnyRecord>();
    for (const state of asArray<AnyRecord>(player?.nodeStates)) map.set(String(state.id), state);
    return map;
  }, [player]);
  const attemptsByNode = useMemo(() => {
    const map = new Map<string, AnyRecord[]>();
    for (const attempt of asArray<AnyRecord>(player?.attempts)) {
      const list = map.get(String(attempt.nodeId)) ?? [];
      list.push(attempt);
      map.set(String(attempt.nodeId), list);
    }
    for (const list of map.values()) list.sort((a, b) => Number(b.attemptNumber) - Number(a.attemptNumber));
    return map;
  }, [player]);

  function latestAttempt(nodeId: string): AnyRecord | undefined {
    return attemptsByNode.get(nodeId)?.[0];
  }

  async function ensureDraft(node: AnyRecord): Promise<AnyRecord> {
    const journeyId = String(player?.journey?.id);
    const latest = latestAttempt(String(node.id));
    if (latest?.status === "draft") return latest;
    const created = await apiRequest<AnyRecord>(`/v1/journeys/${journeyId}/attempts`, {
      method: "POST",
      body: { nodeId: String(node.id) },
    });
    await loadPlayer(journeyId);
    return created;
  }

  async function saveDraft(node: AnyRecord): Promise<AnyRecord> {
    const journeyId = String(player?.journey?.id);
    const draft = await ensureDraft(node);
    const isBoss = node.type === "boss_proof";
    const saved = await apiRequest<AnyRecord>(`/v1/journeys/${journeyId}/attempts/${String(draft.id)}`, {
      method: "PATCH",
      idempotency: false,
      headers: { "If-Match": String(draft.version) },
      body: {
        answerText: answers[String(node.id)] ?? String(draft.answerText ?? ""),
        artifactIds: asArray<string>(draft.artifactIds),
        sourceDisclosure: isBoss
          ? {
              sources: bossSources.split("\n").map((line) => line.trim()).filter(Boolean),
              changesFromInspiration: bossChanges,
            }
          : {},
        aiAssistanceDisclosure: isBoss ? { usedAi: bossUsedAi, description: bossAiDescription } : {},
      },
    });
    await loadPlayer(journeyId);
    return saved;
  }

  async function handleSaveDraft(node: AnyRecord) {
    await run("save-draft", async () => {
      await saveDraft(node);
      setNotice("Đã lưu nháp attempt trên server với optimistic version.");
    });
  }

  async function handleSubmitAttempt(node: AnyRecord) {
    await run("submit-attempt", async () => {
      const saved = await saveDraft(node);
      const journeyId = String(player?.journey?.id);
      const submitted = await apiRequest<AnyRecord>(`/v1/journeys/${journeyId}/attempts/${String(saved.id)}:submit`, {
        method: "POST",
        body: {},
      });
      await loadPlayer(journeyId);
      await loadProgressAndProofs();
      if (selectedProjectId) await loadProjectWorkspace(selectedProjectId);
      if (submitted.status === "passed") {
        setNotice(`Attempt đạt rubric. Server đã ghi ${Number(submitted.xpAwarded ?? 0)} XP vào Ledger.`);
      } else if (submitted.status === "pending_human_review") {
        setNotice("Attempt đang chờ human review; XP chưa được ghi.");
      } else {
        setNotice("Attempt cần sửa theo feedback từng tiêu chí; hãy tạo attempt mới sau khi chỉnh sửa.");
      }
    });
  }

  async function handleCreateProof(event: FormEvent) {
    event.preventDefault();
    await run("create-proof", async () => {
      await apiRequest("/v1/proofs", {
        method: "POST",
        body: {
          proofType,
          title: proofTitle,
          ...(proofDescription.trim() ? { description: proofDescription.trim() } : {}),
          ...(proofUri.trim() ? { externalUri: proofUri.trim() } : {}),
          ...(proofIssuer.trim() ? { issuerDisplayName: proofIssuer.trim() } : {}),
          artifactIds: [],
        },
      });
      await loadProgressAndProofs();
      setProofTitle("");
      setProofUri("");
      setProofIssuer("");
      setProofDescription("");
      setNotice("Đã lưu proof ở cấp Self-declared/Source-linked. GON không gọi đây là Issuer-verified.");
    });
  }

  async function handleReportModule(event: FormEvent) {
    event.preventDefault();
    const moduleVersionId = player?.journey?.upstreamModuleVersionId;
    if (!moduleVersionId) return;
    await run("report", async () => {
      await apiRequest("/v1/reports", {
        method: "POST",
        body: {
          targetType: "module_version",
          targetId: String(moduleVersionId),
          reasonCode: reportReason,
          ...(reportDetail.trim() ? { detail: reportDetail.trim() } : {}),
        },
      });
      setReportDetail("");
      setNotice("Report đã được tiếp nhận và tạo moderation case ở trạng thái open.");
    });
  }

  if (initialLoading) {
    return (
      <main className="page-shell" id="main-content">
        <section className="panel loading-card" aria-live="polite">
          <div>
            <p className="eyebrow">GON · VS1 · P05 REVIEW</p>
            <h1>Đang tải phiên học…</h1>
            <p className="muted">GON đang kiểm tra session và trạng thái tài khoản ở server.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <>
      <a className="skip-link" href="#main-content">Bỏ qua tới nội dung chính</a>
      <header className="topbar">
        <a className="brand" href="/" aria-label="GON — Game Of Nurture">
          <span className="brand-mark" aria-hidden="true">G</span>
          <span>
            <strong>GON</strong>
            <small>GAME OF NURTURE</small>
          </span>
        </a>
        <div className="topbar-actions">
          {isActive && currentProgress ? (
            <div className="level-chip" aria-label={`Tiến độ trọn đời: Lv.${Number(currentProgress.numericLevel)} ${String(currentProgress.era)}`}>
              <span>Lv.{Number(currentProgress.numericLevel)} · {String(currentProgress.era)}</span>
              <span className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(currentProgress.xpInLevel)}>
                <i style={{ width: `${Number(currentProgress.xpInLevel)}%` }} />
              </span>
              <small>{Number(currentProgress.lifetimeXp)} Lifetime XP · còn {Number(currentProgress.xpToNextLevel)} XP tới Lv.{Number(currentProgress.numericLevel) + 1}</small>
            </div>
          ) : null}
          {bootstrap && !signedOut ? (
            <button className="button secondary" type="button" onClick={() => void handleSignOut()} disabled={busy !== null}>
              Đăng xuất
            </button>
          ) : null}
        </div>
      </header>

      <main className="page-shell" id="main-content">
        <div aria-live="polite" aria-atomic="true">
          {notice ? <p className="notice">{notice}</p> : null}
          {error ? <p className="error-box" role="alert">{error}</p> : null}
          {busy ? <p className="muted">Đang xử lý: {busy}…</p> : null}
        </div>

        {signedOut || !bootstrap ? (
          <section className="hero-grid" aria-labelledby="signed-out-heading">
            <article className="panel hero-panel">
              <p className="eyebrow gold">Search anything · Brew what is missing · Prove learning</p>
              <h1 id="signed-out-heading">Biến tò mò thành bằng chứng học thật.</h1>
              <p>
                Dán text, URL hoặc file/ảnh trong giới hạn Alpha. GON tìm module được phép xem; nếu còn thiếu,
                bạn xác nhận Brew một bản nháp riêng tư, Fork thành hành trình của mình và chứng minh hiểu biết qua Retrieval, Transfer và Boss Proof.
              </p>
              <div className="badge-row">
                <span className="badge success">Private by default</span>
                <span className="badge info">768D search contract</span>
                <span className="badge warning">AI draft · Cần kiểm chứng</span>
                <span className="badge">Lifelong Level không giới hạn</span>
              </div>
              <div className="callout" style={{ marginTop: 18 }}>
                <strong>Trạng thái hiện tại:</strong> P04 VS1 đã được duyệt làm baseline local/test; P05 đang rà soát NFR và chưa đạt. Bản chạy này vẫn dùng deterministic embedding/Brew và memory store, chưa nối Gemini/ADK/PostgreSQL production hay Google credentials thật.
              </div>
            </article>

            <article className="panel light-panel">
              <p className="eyebrow dark">SCR-01 · Private Alpha</p>
              <h2>Đăng nhập để bắt đầu</h2>
              <p>Private Alpha — Google là identity provider đã duyệt tại P03. Không có cổng độ tuổi (quyết định PO 24/10: dự án không quan tâm user có trên 18 tuổi hay không).</p>
              {googleConfigured ? (
                <a className="button primary large" href="/api/auth/signin/google?callbackUrl=%2F">Tiếp tục với Google</a>
              ) : (
                <p className="error-box">Google OAuth chưa được cấu hình trong môi trường này.</p>
              )}
              {devAuthEnabled ? (
                <form className="stack" style={{ marginTop: 20 }} onSubmit={(event) => void handleDevSignIn(event)}>
                  <h3>Dev sign-in (chỉ local)</h3>
                  <label className="field">
                    <span>Tên hiển thị cho phiên dev</span>
                    <input type="text" value={devName} onChange={(event) => setDevName(event.target.value)} required minLength={2} />
                  </label>
                  <button className="button secondary large" type="submit" disabled={busy !== null}>Tạo phiên dev local</button>
                  <p className="hint">Dev identity bị tắt hoàn toàn ở production và không thay thế Google OAuth.</p>
                </form>
              ) : null}
              {!googleConfigured && !devAuthEnabled ? (
                <p className="hint">Hãy cấu hình Google OAuth hoặc bật <code>GON_DEV_AUTH=1</code> cho môi trường phát triển.</p>
              ) : null}
            </article>
          </section>
        ) : !isActive ? (
          <section className="hero-grid" aria-labelledby="onboarding-heading">
            <article className="panel hero-panel">
              <p className="eyebrow gold">Invite · Consent · Footprint</p>
              <h1 id="onboarding-heading">Hoàn tất điều kiện vào Private Alpha.</h1>
              <p>
                Invite chỉ lưu hash và redeem một lần. GON <strong>không hỏi độ tuổi</strong> (quyết định PO 24/10);
                payload attestation giữ nguyên fields theo contract P03 đã khoá.
              </p>
              <ul>
                <li>Project, Journey và Proof mặc định riêng tư.</li>
                <li>Footprint chỉ dùng cho ranking nếu bạn đồng ý.</li>
                <li>Alpha không dùng dữ liệu của bạn để huấn luyện mô hình.</li>
              </ul>
            </article>
            <form className="panel light-panel stack" onSubmit={(event) => void handleAttestation(event)}>
              <div>
                <p className="eyebrow dark">SCR-01 · Onboarding</p>
                <h2>Xác nhận trước khi tạo dữ liệu học</h2>
              </div>
              <p className="hint">🔒 Không còn cổng độ tuổi (quyết định PO 24/10). Terms/privacy version vẫn được ghi theo contract P03: {TERMS_VERSION} · {PRIVACY_VERSION}.</p>
              <label className="field">
                <span>Mã mời Private Alpha</span>
                <input type="text" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} autoComplete="one-time-code" required />
                {devInviteHint ? <small>Môi trường dev đã điền mã mời cấu hình sẵn.</small> : null}
              </label>
              <fieldset>
                <legend>Cá nhân hóa bằng footprint trong GON</legend>
                <div className="stack">
                  <label className="radio-row">
                    <input type="radio" name="personalization" value="granted" checked={personalization === "granted"} onChange={() => setPersonalization("granted")} />
                    <span>Bật cá nhân hóa<small>Dùng mode, lựa chọn và kết quả học trong GON để xếp hạng; không đọc mạng xã hội bên ngoài.</small></span>
                  </label>
                  <label className="radio-row">
                    <input type="radio" name="personalization" value="denied" checked={personalization === "denied"} onChange={() => setPersonalization("denied")} />
                    <span>Không dùng footprint<small>Bạn vẫn học được đầy đủ; ranking mới sẽ không dùng dấu vết cá nhân.</small></span>
                  </label>
                </div>
              </fieldset>
              <button className="button primary large" type="submit" disabled={busy !== null}>Kích hoạt tài khoản</button>
            </form>
          </section>
        ) : (
          <>
            <nav className="main-nav" aria-label="Điều hướng GON VS1">
              <button type="button" aria-current={view === "start" ? "page" : undefined} onClick={() => setView("start")}>Bắt đầu</button>
              <button type="button" aria-current={view === "outputs" ? "page" : undefined} onClick={() => setView("outputs")} disabled={!explorer}>Hướng học</button>
              <button type="button" aria-current={view === "learn" ? "page" : undefined} onClick={() => setView("learn")} disabled={!player}>Học & Boss Proof</button>
              <button type="button" aria-current={view === "arena" ? "page" : undefined} onClick={() => setView("arena")}>⚔️ Arena & Agent</button>
              <button type="button" aria-current={view === "progress" ? "page" : undefined} onClick={() => setView("progress")}>Hành trình</button>
              <button type="button" aria-current={view === "proofs" ? "page" : undefined} onClick={() => setView("proofs")}>Proof Vault</button>
            </nav>

            {view === "start" ? (
              <section aria-labelledby="start-heading">
                <div className="section-heading">
                  <p className="eyebrow">SCR-02 → SCR-04 · Universal Input</p>
                  <h1 id="start-heading">Bạn muốn học điều gì hôm nay?</h1>
                  <p>Input vừa là truy vấn tìm kiếm vừa là bằng chứng nguồn. Mọi artifact đều có provenance, owner, trạng thái trích xuất và không bị AI trình bày như đã đọc nếu chỉ ở mức metadata-only.</p>
                </div>

                <div className="workspace-grid">
                  <form className="panel stack" onSubmit={(event) => void handleCreateProject(event)}>
                    <h2>Tạo Learning Project</h2>
                    <label className="field">
                      <span>Tiêu đề (tùy chọn)</span>
                      <input type="text" value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} maxLength={200} placeholder="Ví dụ: Vì sao một bài hát viral?" />
                    </label>
                    <label className="field">
                      <span>Text / câu hỏi / chủ đề</span>
                      <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} required maxLength={20_000} placeholder="Dán câu hỏi, đoạn văn hoặc ý tưởng bạn muốn biến thành hành trình học…" />
                      <small>Tối đa 20.000 ký tự cho prompt ban đầu.</small>
                    </label>
                    <label className="field">
                      <span>Mục tiêu học quan sát được</span>
                      <input type="text" value={goal} onChange={(event) => setGoal(event.target.value)} required maxLength={500} placeholder="Ví dụ: Tạo infographic giải thích cơ chế lan truyền" />
                    </label>
                    <fieldset>
                      <legend>Learning Mode cho phiên này</legend>
                      <div className="mode-grid">
                        {LEARNING_MODES.map((mode) => (
                          <label key={mode.value}>
                            <input type="radio" name="learning-mode" value={mode.value} checked={learningMode === mode.value} onChange={() => setLearningMode(mode.value)} />
                            <span><strong>{mode.label}</strong><small>{mode.description}</small></span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="field-row three">
                      <label className="field">
                        <span>Độ sâu</span>
                        <select value={depth} onChange={(event) => setDepth(event.target.value)}>
                          <option value="intro">Intro</option>
                          <option value="standard">Standard</option>
                          <option value="deep">Deep</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>Thời gian (phút)</span>
                        <input type="number" min={1} max={600} value={timeBudget} onChange={(event) => setTimeBudget(Number(event.target.value))} required />
                      </label>
                      <label className="field">
                        <span>Loại URL bổ sung</span>
                        <select value={urlKind} onChange={(event) => setUrlKind(event.target.value)}>
                          <option value="website_url">Website</option>
                          <option value="youtube_url">YouTube</option>
                          <option value="facebook_url">Facebook</option>
                        </select>
                      </label>
                    </div>
                    <label className="field">
                      <span>URL bổ sung (tùy chọn)</span>
                      <input type="url" value={urlValue} onChange={(event) => setUrlValue(event.target.value)} placeholder="https://…" />
                      <small>VS1 local lưu URL ở mức metadata-only; không tuyên bố đã đọc transcript/nội dung chính.</small>
                    </label>
                    <label className="field">
                      <span>File/ảnh bổ sung (tùy chọn)</span>
                      <input type="file" accept=".pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
                      <small>PDF hiện được chấp nhận nhưng text extraction chưa bật; ảnh ở mức metadata-only/OCR chưa bật.</small>
                    </label>
                    <button className="button primary large" type="submit" disabled={busy !== null}>Tìm hoặc chuẩn bị Brew</button>
                  </form>

                  <div className="stack">
                    <section className="panel" aria-labelledby="projects-heading">
                      <p className="eyebrow">SCR-13 · Dự án của tôi</p>
                      <h2 id="projects-heading">Tiếp tục project gần đây</h2>
                      {projects.length === 0 ? <p className="muted">Chưa có project. Hãy tạo input đầu tiên ở biểu mẫu bên cạnh.</p> : (
                        <div className="project-list">
                          {projects.map((project) => (
                            <button key={String(project.id)} type="button" className="project-button" aria-current={project.id === selectedProjectId ? "true" : undefined} onClick={() => void handleSelectProject(String(project.id))}>
                              <strong>{String(project.title)}</strong>
                              <small>{String(project.goal)} · {String(project.status)} · cập nhật {formatDate(project.updatedAt)}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>

                    {workspace ? (
                      <section className="panel" aria-labelledby="workspace-heading">
                        <p className="eyebrow">Project Workspace</p>
                        <h2 id="workspace-heading">{String(workspace.project?.title ?? "Project")}</h2>
                        <ol className="stepper">
                          {asArray<AnyRecord>(workspace.stepper).map((step) => (
                            <li key={String(step.key)} data-status={String(step.status)}>{String(step.key)} · {String(step.status)}</li>
                          ))}
                        </ol>
                        <p><strong>Next action từ server:</strong> <code>{String(workspace.nextAction)}</code></p>
                        <h3>Source Artifacts</h3>
                        <div className="artifact-list">
                          {asArray<AnyRecord>(workspace.artifacts).map((artifact) => (
                            <article className="artifact-row" key={String(artifact.id)}>
                              <strong>{String(artifact.displayName)}</strong>
                              <small>{String(artifact.kind)} · {String(artifact.extractionStatus)} · {String(artifact.safetyStatus)} · chunks: {Number(artifact.coverage?.chunkCount ?? 0)}</small>
                              <span className={`badge ${statusTone(String(artifact.extractionStatus))}`}>{String(artifact.extractionStatus)}</span>
                            </article>
                          ))}
                        </div>
                        <div className="button-row" style={{ marginTop: 16 }}>
                          <button className="button secondary" type="button" disabled={busy !== null || !selectedProjectId} onClick={() => selectedProjectId && void run("search", async () => { await runSearch(selectedProjectId); })}>
                            Chạy Search lại
                          </button>
                          {explorer ? <button className="button primary" type="button" onClick={() => setView("outputs")}>Xem hướng học</button> : null}
                        </div>
                      </section>
                    ) : null}
                  </div>
                </div>

                {search ? (
                  <section className="panel" style={{ marginTop: 18 }} aria-labelledby="search-heading" aria-live="polite">
                    <p className="eyebrow">SCR-03 · Search Verdict</p>
                    <h2 id="search-heading">{VERDICT_LABELS[String(search.verdict)]?.label ?? "Search đã hoàn tất"}</h2>
                    <p className="muted">{VERDICT_LABELS[String(search.verdict)]?.description}</p>
                    <div className="badge-row">
                      <span className={`badge ${VERDICT_LABELS[String(search.verdict)]?.tone ?? ""}`}>{String(search.verdict)}</span>
                      <span className="badge info">{asArray(search.results).length} kết quả được phép xem</span>
                    </div>
                    {asArray<string>(search.matchedConcepts).length > 0 ? <p><strong>Đã khớp:</strong> {asArray<string>(search.matchedConcepts).join(", ")}</p> : null}
                    {asArray<string>(search.missingConcepts).length > 0 ? <p><strong>Còn thiếu:</strong> {asArray<string>(search.missingConcepts).join(", ")}</p> : null}
                    {asArray<AnyRecord>(search.clarificationQuestions).length > 0 ? (
                      <div className="callout">
                        <strong>Câu hỏi làm rõ:</strong>
                        <ul>{asArray<AnyRecord>(search.clarificationQuestions).map((question) => <li key={String(question.id)}>{String(question.question)}</li>)}</ul>
                        <p>Hãy sửa prompt/mục tiêu hoặc thêm nguồn rồi tạo Search mới; attempt cũ không bị sửa.</p>
                      </div>
                    ) : null}
                    {asArray<AnyRecord>(search.results).length > 0 ? (
                      <div className="result-list">
                        {asArray<AnyRecord>(search.results).map((result) => (
                          <article className="result-card" key={String(result.moduleVersionId)}>
                            <strong>#{Number(result.rank)} · {String(result.title)}</strong>
                            <small>Nguồn: {String(result.sourceStatus)} · Lý do: {asArray<string>(result.reasonCodes).map((code) => REASON_LABELS[code] ?? code).join(", ")}</small>
                          </article>
                        ))}
                      </div>
                    ) : null}
                    {["missing", "related", "found"].includes(String(search.verdict)) ? (
                      <div className="callout" style={{ marginTop: 16 }}>
                        <p className="eyebrow gold">SCR-04 · Brew Your Topic</p>
                        <h3>Tạo bản nháp học riêng tư từ bằng chứng của bạn</h3>
                        <p>Brew không tự chạy. Khi bạn xác nhận, server kiểm quota/fingerprint, tạo Canonical Module Graph, kiểm citation ngoài evidence bundle và chỉ persist ở trạng thái <strong>draft_private</strong>.</p>
                        {brewJob ? <p><span className={`badge ${statusTone(String(brewJob.status))}`}>{String(brewJob.status)}</span> {brewJob.currentStep ? `· ${String(brewJob.currentStep)}` : ""}</p> : null}
                        <div className="button-row">
                          <button className="button gold" type="button" onClick={() => void handleBrew()} disabled={busy !== null || brewJob?.status === "succeeded"}>
                            {brewJob?.status === "succeeded" ? "Brew đã hoàn tất" : isActiveBrewStatus(brewJob?.status) ? "Theo dõi Brew" : "Bắt đầu Brew"}
                          </button>
                          {explorer ? <button className="button secondary" type="button" onClick={() => setView("outputs")}>Xem hướng học sẵn có</button> : null}
                        </div>
                      </div>
                    ) : null}
                  </section>
                ) : null}
              </section>
            ) : null}

            {view === "arena" ? (
              <section aria-label="Arena và Journey Agent — bề mặt đã PO chốt (standalone v2.7–v2.12)">
                <JourneyAgentPanel
                  signals={{
                    confirmedSuccess: asArray<AnyRecord>(currentProgress?.mastery).length,
                    steerability: 0,
                    recovery: 0,
                  }}
                  onFeedback={(ok) => setNotice(ok ? "✅ Confirmed success — tín hiệu Agent Arena đã ghi (local VS1)." : "👎 Đã ghi phản hồi chưa đạt (local VS1).")}
                />
                <div style={{ height: 16 }} />
                <ArenaPanel />
              </section>
            ) : null}

            {view === "outputs" ? (
              <section aria-labelledby="outputs-heading">
                <div className="section-heading">
                  <p className="eyebrow">SCR-05 · Output Explorer</p>
                  <h1 id="outputs-heading">Chọn hướng học phù hợp nhất</h1>
                  <p>VS1 cung cấp Candidate Outputs cơ bản từ cùng Canonical Module Graph. Nếu chưa đủ 10 hướng thật khác nhau, GON hiển thị số thật và lý do thiếu thay vì bịa thêm card trùng lặp.</p>
                </div>
                {!explorer ? <div className="empty-state">Chưa có CandidateSet. Hãy quay lại Bắt đầu và chạy Search/Brew.</div> : (
                  <>
                    <section className="panel" style={{ marginBottom: 18 }}>
                      <div className="field-row two">
                        <label className="field">
                          <span>Xếp hạng theo Learning Mode</span>
                          <select value={rankingMode} onChange={(event) => void handleRankingMode(event.target.value)}>
                            {LEARNING_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
                          </select>
                        </label>
                        <div>
                          <strong>Vì sao thứ tự này?</strong>
                          <p className="muted">
                            Snapshot <code>{String(explorer.rankingSnapshot?.id ?? "chưa có")}</code> dùng relevance, concept coverage, source quality, mode/time fit.
                            Personalization: <strong>{explorer.rankingSnapshot?.personalizationApplied ? "đang bật" : "không áp dụng"}</strong>. Internal trend = 0 trong VS1.
                          </p>
                          <p className="muted">CandidateSet: {Number(explorer.candidateSet?.actualCount ?? 0)}/{Number(explorer.candidateSet?.targetCount ?? 10)} · {asArray<string>(explorer.candidateSet?.shortfallReasonCodes).join(", ") || "đủ số lượng"}</p>
                        </div>
                      </div>
                    </section>
                    <div className="candidate-grid">
                      {asArray<AnyRecord>(explorer.candidates).map((candidate) => (
                        <article className={`candidate-card ${Number(candidate.rank) <= 3 ? "top" : ""}`} key={String(candidate.id)}>
                          <div className="badge-row">
                            <span className="badge warning">#{Number(candidate.rank)}</span>
                            <span className="badge info">{String(candidate.format)}</span>
                            <span className="badge">{String(candidate.cluster)}</span>
                            <span className={`badge ${candidate.sourceStatus === "citation_checked" ? "success" : "warning"}`}>{String(candidate.sourceStatus)}</span>
                          </div>
                          <h3>{String(candidate.title)}</h3>
                          <p>{String(candidate.promise)}</p>
                          <div className="meta-row">
                            <span className="badge">{Number(candidate.estimatedMinutes)} phút</span>
                            <span className="badge">{String(candidate.difficulty)}</span>
                            <span className="badge">{String(candidate.artifactOutcome)}</span>
                          </div>
                          <p><strong>Lý do xếp hạng:</strong> {asArray<string>(candidate.rankingReasonCodes).map((code) => REASON_LABELS[code] ?? code).join(", ") || "Theo snapshot hiện tại"}</p>
                          <button className="button primary" type="button" disabled={busy !== null} onClick={() => void handleFork(candidate)}>
                            Tạo hành trình của tôi
                          </button>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </section>
            ) : null}

            {view === "learn" ? (
              <section aria-labelledby="learn-heading">
                <div className="section-heading">
                  <p className="eyebrow">SCR-07 → SCR-09 · Journey Player</p>
                  <h1 id="learn-heading">{String(player?.journey?.title ?? "Hành trình học của bạn")}</h1>
                  <p>Branch riêng tư khóa upstream ModuleVersion. Chỉ đọc concept tối đa là Exposed; XP lõi chỉ được server ghi khi attempt đạt rubric.</p>
                </div>
                {!player || !graph || !activeNode ? <div className="empty-state">Chưa có Journey. Hãy Fork một hướng học ở Output Explorer.</div> : (
                  <>
                    <section className="panel" style={{ marginBottom: 18 }}>
                      <div className="badge-row">
                        <span className="badge success">Hành trình riêng tư</span>
                        <span className="badge info">Upstream {String(player.journey.upstreamModuleVersionId)}</span>
                        <span className="badge warning">AI/local draft · {String(graph.module?.difficulty ?? "")}</span>
                        <span className={`badge ${statusTone(String(player.journey.status))}`}>{String(player.journey.status)}</span>
                      </div>
                      <h2>{String(graph.module.title)}</h2>
                      <p className="muted">{String(graph.module.summary)}</p>
                      <div
                        className="node-tabs"
                        role="tablist"
                        aria-label="Các bước học"
                        onKeyDown={handleNodeTabsKeyDown}
                      >
                        {graphNodes.map((node, index) => {
                          const state = nodeStateById.get(String(node.id));
                          const locked = state?.status === "locked";
                          const selected = activeNode.id === node.id;
                          return (
                            <button
                              key={String(node.id)}
                              id={nodeTabId(String(node.id))}
                              data-node-id={String(node.id)}
                              type="button"
                              role="tab"
                              aria-selected={selected}
                              aria-controls="active-node-panel"
                              tabIndex={selected ? 0 : -1}
                              disabled={locked}
                              onClick={() => setActiveNodeId(String(node.id))}
                            >
                              {index + 1} · {String(node.title)}{locked ? " (đang khóa)" : ""}
                            </button>
                          );
                        })}
                      </div>
                      <p className="muted">Node hiện tại từ server: <code>{String(player.currentNodeId ?? "đã hoàn tất các node bắt buộc")}</code></p>
                    </section>

                    <section
                      className="panel stack"
                      id="active-node-panel"
                      role="tabpanel"
                      aria-labelledby={nodeTabId(String(activeNode.id))}
                      tabIndex={0}
                    >
                      <div>
                        <p className="eyebrow">{String(activeNode.type)} · {Number(activeNode.estimatedMinutes ?? 0)} phút</p>
                        <h2 id="active-node-heading">{String(activeNode.title)}</h2>
                        <p className="muted">{String(activeNode.accessibility?.textAlternative ?? "")}</p>
                      </div>

                      {asArray<AnyRecord>(activeNode.content?.blocks).map((block, index) => (
                        <div className="content-block" key={`${String(activeNode.id)}-${index}`}>
                          {block.kind === "source_excerpt" ? <blockquote>{String(block.text)}</blockquote> : <p>{String(block.text)}</p>}
                        </div>
                      ))}

                      {asArray<AnyRecord>(activeNode.citations).length > 0 ? (
                        <div>
                          <h3>Citation trong node</h3>
                          <div className="badge-row">
                            {asArray<AnyRecord>(activeNode.citations).map((citation, index) => {
                              const source = asArray<AnyRecord>(graph.sources).find((item) => item.id === citation.sourceId);
                              return <span className="badge info" key={index}>{String(source?.title ?? citation.sourceId)} · {String(citation.support)}</span>;
                            })}
                          </div>
                        </div>
                      ) : null}

                      {activeNode.assessment ? (() => {
                        const nodeId = String(activeNode.id);
                        const attempt = latestAttempt(nodeId);
                        const rubric = asArray<AnyRecord>(graph.rubrics).find((item) => item.id === activeNode.assessment.rubricId);
                        const isDraft = !attempt || attempt.status === "draft";
                        const isPending = attempt?.status === "pending_human_review";
                        const sampleAnswer = typeof activeNode.content?.sampleAnswer === "string" ? String(activeNode.content.sampleAnswer) : null;
                        return (
                          <>
                            <div className="rubric-box">
                              <h3>Rubric được công bố trước: {String(rubric?.title ?? activeNode.assessment.rubricId)}</h3>
                              <ul>
                                {asArray<AnyRecord>(rubric?.criteria).map((criterion) => (
                                  <li key={String(criterion.id)}><strong>{String(criterion.id)}:</strong> {String(criterion.description)}</li>
                                ))}
                              </ul>
                              <p className="muted">Mastery target: {MASTERY_LABELS[String(activeNode.assessment.masteryTarget)] ?? String(activeNode.assessment.masteryTarget)}</p>
                            </div>

                            <p><strong>Đề bài:</strong> {String(activeNode.content?.prompt ?? "")}</p>
                            {attempt ? <p><span className={`badge ${statusTone(String(attempt.status))}`}>{String(attempt.status)}</span> Attempt #{Number(attempt.attemptNumber)} · XP đã ghi: {Number(attempt.xpAwarded ?? 0)}</p> : null}

                            <label className="field">
                              <span>Bài làm của bạn</span>
                              <textarea
                                rows={9}
                                value={answers[nodeId] ?? String(attempt?.answerText ?? "")}
                                onChange={(event) => setAnswers((current) => ({ ...current, [nodeId]: event.target.value }))}
                                disabled={!isDraft && !["needs_revision", "passed"].includes(String(attempt?.status))}
                                placeholder="Viết bằng lời của bạn; đừng sao chép nguyên văn nguồn hoặc đáp án mẫu…"
                              />
                            </label>

                            {activeNode.type === "boss_proof" ? (
                              <div className="grid-two">
                                <label className="field">
                                  <span>Nguồn đã dùng (mỗi dòng một nguồn)</span>
                                  <textarea rows={4} value={bossSources} onChange={(event) => setBossSources(event.target.value)} />
                                </label>
                                <div className="stack">
                                  <label className="field">
                                    <span>Phần bạn thay đổi so với cảm hứng/nguồn</span>
                                    <textarea rows={4} value={bossChanges} onChange={(event) => setBossChanges(event.target.value)} />
                                  </label>
                                  <label className="field">
                                    <span>Mô tả hỗ trợ AI</span>
                                    <textarea rows={3} value={bossAiDescription} onChange={(event) => setBossAiDescription(event.target.value)} />
                                  </label>
                                  <label className="check-row" style={{ borderColor: "var(--line-on-dark)", background: "rgba(255,255,255,0.05)", color: "#fff" }}>
                                    <input type="checkbox" checked={bossUsedAi} onChange={(event) => setBossUsedAi(event.target.checked)} />
                                    <span>Tôi đã dùng AI trong quá trình tạo artifact</span>
                                  </label>
                                </div>
                              </div>
                            ) : null}

                            <div className="button-row">
                              <button className="button secondary" type="button" disabled={busy !== null || isPending} onClick={() => void handleSaveDraft(activeNode)}>
                                Lưu nháp
                              </button>
                              <button className={`button ${activeNode.type === "boss_proof" ? "gold" : "primary"}`} type="button" disabled={busy !== null || isPending} onClick={() => void handleSubmitAttempt(activeNode)}>
                                {activeNode.type === "boss_proof" ? "Nộp Boss Proof" : "Nộp để chấm rubric"}
                              </button>
                              {attempt && attempt.status !== "draft" ? <span className="hint">Attempt đã nộp bị khóa; lưu/nộp lại từ bài viết hiện tại sẽ tạo attempt mới.</span> : null}
                            </div>

                            {attempt?.assessment ? (
                              <div className="feedback-box" aria-live="polite">
                                <h3>Kết quả assessment</h3>
                                <p>{String(attempt.assessment.feedback)}</p>
                                <ul>
                                  {asArray<AnyRecord>(attempt.assessment.criteria).map((criterion) => (
                                    <li key={String(criterion.criterionId)}>
                                      <strong>{String(criterion.criterionId)}:</strong> {criterion.passed ? "Đạt" : "Chưa đạt"} — {String(criterion.feedback)}
                                    </li>
                                  ))}
                                </ul>
                                <p className="muted">Assessor: {String(attempt.assessment.assessorType)} · {String(attempt.assessment.assessorVersion)} · confidence {Number(attempt.assessment.confidence).toFixed(2)}</p>
                              </div>
                            ) : null}

                            {sampleAnswer ? (
                              <div className="sample-answer">
                                <h3>Đáp án tham chiếu đã mở sau khi nộp</h3>
                                <p>{sampleAnswer}</p>
                              </div>
                            ) : null}
                          </>
                        );
                      })() : (
                        <div className="callout">
                          <strong>Chỉ đọc tới đây là mức Exposed.</strong> Hãy chuyển sang Retrieval để tự giải thích; XP lõi chưa được ghi cho việc xem nội dung.
                        </div>
                      )}
                    </section>

                    <details className="report-box" style={{ marginTop: 18 }}>
                      <summary>Báo cáo module này</summary>
                      <form className="stack" onSubmit={(event) => void handleReportModule(event)}>
                        <label className="field">
                          <span>Lý do</span>
                          <select value={reportReason} onChange={(event) => setReportReason(event.target.value)}>
                            <option value="source_quality">Nguồn/citation chưa đáng tin</option>
                            <option value="incorrect_content">Nội dung sai</option>
                            <option value="copyright">Nghi vấn bản quyền</option>
                            <option value="unsafe_content">Nội dung không an toàn</option>
                            <option value="other">Khác</option>
                          </select>
                        </label>
                        <label className="field">
                          <span>Chi tiết (tùy chọn, tối đa 2.000 ký tự)</span>
                          <textarea rows={4} maxLength={2000} value={reportDetail} onChange={(event) => setReportDetail(event.target.value)} />
                        </label>
                        <button className="button danger" type="submit" disabled={busy !== null}>Gửi report</button>
                      </form>
                    </details>
                  </>
                )}
              </section>
            ) : null}

            {view === "progress" ? (
              <section aria-labelledby="progress-heading">
                <div className="section-heading">
                  <p className="eyebrow">SCR-10 · Journey & Lifelong Progress</p>
                  <h1 id="progress-heading">Bạn đang ở đâu trong hành trình trọn đời?</h1>
                  <p>Level luôn được tính từ Lifetime XP bằng <code>floor(LifetimeXP / 100)</code>. Forever ở Lv.35+ là một Era mở, không phải mức trần.</p>
                </div>
                <KolPathCard
                  hotOutputs={0}
                  trendToken={0}
                  lifetimeXp={Number(currentProgress?.lifetimeXp ?? 0)}
                  dataNote="VS1 chưa có backend xu hướng (P05+): token & output ≥40 sẽ sống khi trend API được nối — tier hiện tính trên dữ liệu thật khả dụng."
                />
                <div className="grid-three">
                  <article className="panel">
                    <p className="eyebrow gold">Lifelong Level</p>
                    <span className="metric-value">Lv.{Number(currentProgress?.numericLevel ?? 0)} · {String(currentProgress?.era ?? "Zero")}</span>
                    <span className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(currentProgress?.xpInLevel ?? 0)}>
                      <i style={{ width: `${Number(currentProgress?.xpInLevel ?? 0)}%` }} />
                    </span>
                    <p className="muted">{Number(currentProgress?.lifetimeXp ?? 0)} Lifetime XP · còn {Number(currentProgress?.xpToNextLevel ?? 100)} XP tới Lv.{Number(currentProgress?.numericLevel ?? 0) + 1}</p>
                  </article>
                  <article className="panel">
                    <p className="eyebrow">Topic Mastery</p>
                    {asArray<AnyRecord>(currentProgress?.mastery).length === 0 ? <p className="muted">Chưa có mastery. Hãy Fork một module để bắt đầu ở mức Exposed.</p> : asArray<AnyRecord>(currentProgress?.mastery).slice(0, 8).map((item) => (
                      <div className="mastery-row" key={String(item.conceptId)}>
                        <span>{String(item.conceptId)}</span>
                        <strong>{MASTERY_LABELS[String(item.level)] ?? String(item.level)}</strong>
                      </div>
                    ))}
                  </article>
                  <article className="panel">
                    <p className="eyebrow">Latest Proof</p>
                    {currentProgress?.latestProof ? (
                      <>
                        <span className="metric-value">{String(currentProgress.latestProof.title)}</span>
                        <p className="muted">{String(currentProgress.latestProof.verificationLevel)} · Private · {formatDate(currentProgress.latestProof.createdAt)}</p>
                        <button className="button secondary" type="button" onClick={() => setView("proofs")}>Mở Proof Vault</button>
                      </>
                    ) : <p className="muted">Chưa có proof. Boss Proof đạt rubric sẽ tạo System-recorded Proof.</p>}
                  </article>
                </div>

                <div className="grid-two" style={{ marginTop: 18 }}>
                  <section className="panel">
                    <h2>XP Ledger</h2>
                    {ledger.length === 0 ? <p className="muted">Chưa có XP. Xem nội dung, Fork rỗng hoặc vote không tạo XP lõi.</p> : ledger.map((entry) => (
                      <div className="ledger-row" key={String(entry.id)}>
                        <span><strong>{Number(entry.delta) > 0 ? "+" : ""}{Number(entry.delta)} XP</strong><br /><small className="muted">{String(entry.ruleVersion)} · {formatDate(entry.createdAt)}</small></span>
                        <span className={`badge ${statusTone(String(entry.status))}`}>{String(entry.status)}</span>
                      </div>
                    ))}
                  </section>
                  <section className="panel">
                    <h2>Journey Branches</h2>
                    {journeys.length === 0 ? <p className="muted">Chưa có branch nào.</p> : (
                      <div className="project-list">
                        {journeys.map((journey) => (
                          <button className="project-button" type="button" key={String(journey.id)} onClick={() => void run("load-journey", async () => { await loadPlayer(String(journey.id)); setView("learn"); })}>
                            <strong>{String(journey.title)}</strong>
                            <small>{String(journey.status)} · upstream {String(journey.upstreamModuleVersionId)} · cập nhật {formatDate(journey.updatedAt)}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </section>
            ) : null}

            {view === "proofs" ? (
              <section aria-labelledby="proofs-heading">
                <div className="section-heading">
                  <p className="eyebrow">SCR-11 · Proof Vault</p>
                  <h1 id="proofs-heading">Bằng chứng học của bạn, đúng mức xác minh</h1>
                  <p>Link/ảnh chứng chỉ chỉ ở mức Source-linked. Boss Proof do GON chấm đạt mới là System-recorded. Không có nút biến proof thành Issuer-verified trong Alpha.</p>
                </div>
                <div className="grid-two">
                  <div className="proof-list">
                    {proofs.length === 0 ? <div className="empty-state">Chưa có proof trong Vault.</div> : proofs.map((proof) => (
                      <article className="proof-card" key={String(proof.id)}>
                        <span className={`badge ${proof.verificationLevel === "system_recorded" ? "success" : proof.verificationLevel === "source_linked" ? "info" : ""}`}>
                          {String(proof.verificationLevel)}
                        </span>
                        <h3>{String(proof.title)}</h3>
                        <p>{String(proof.description ?? "")}</p>
                        <p><strong>Chứng minh:</strong></p>
                        <ul>{asArray<string>(proof.proves).map((item) => <li key={item}>{item}</li>)}</ul>
                        <p><strong>Không chứng minh:</strong></p>
                        <ul>{asArray<string>(proof.doesNotProve).map((item) => <li key={item}>{item}</li>)}</ul>
                        <p className="muted">Private · {formatDate(proof.createdAt)}{proof.issuerDisplayName ? ` · Issuer tự khai: ${String(proof.issuerDisplayName)}` : ""}</p>
                      </article>
                    ))}
                  </div>
                  <form className="panel light-panel stack" onSubmit={(event) => void handleCreateProof(event)}>
                    <div>
                      <p className="eyebrow dark">Thêm proof ngoài</p>
                      <h2>Lưu chứng chỉ/link/POAP tham chiếu</h2>
                      <p>Đây là metadata riêng tư. Việc gắn link không xác minh issuer và không cộng XP.</p>
                    </div>
                    <label className="field">
                      <span>Loại proof</span>
                      <select value={proofType} onChange={(event) => setProofType(event.target.value)}>
                        <option value="certificate_link">Link chứng chỉ</option>
                        <option value="poap_reference">POAP tham chiếu</option>
                        <option value="youtube_artifact">Artifact YouTube</option>
                        <option value="facebook_artifact">Artifact Facebook</option>
                        <option value="external_artifact">Artifact bên ngoài khác</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Tiêu đề</span>
                      <input type="text" required value={proofTitle} onChange={(event) => setProofTitle(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>URL nguồn (tùy chọn)</span>
                      <input type="url" value={proofUri} onChange={(event) => setProofUri(event.target.value)} placeholder="https://…" />
                    </label>
                    <label className="field">
                      <span>Issuer hiển thị tự khai (tùy chọn)</span>
                      <input type="text" value={proofIssuer} onChange={(event) => setProofIssuer(event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Mô tả (tùy chọn)</span>
                      <textarea rows={4} value={proofDescription} onChange={(event) => setProofDescription(event.target.value)} />
                    </label>
                    <button className="button primary large" type="submit" disabled={busy !== null}>Lưu vào Proof Vault</button>
                  </form>
                </div>
              </section>
            ) : null}
          </>
        )}
      </main>
    </>
  );
}
