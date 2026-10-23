import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import type { AnyRecord } from "@/lib/api";
import { progressFromXp } from "@/server/progression";
import {
  createGonStorybookDataset,
  createStorybookCandidates,
} from "./gonFixtures";

type DesignVariant =
  | "foundations"
  | "controls"
  | "forms"
  | "learning-cards"
  | "learning-patterns"
  | "lifelong-levels"
  | "feedback";

interface GonDesignSystemProps {
  variant: DesignVariant;
}

const LEARNING_MODES = [
  {
    value: "deep_mastery",
    label: "Deep Mastery",
    description: "Đi sâu, ưu tiên độ bao phủ concept và nguồn.",
  },
  {
    value: "apply_at_work",
    label: "Apply at Work",
    description: "Áp dụng vào công việc hoặc tình huống thật.",
  },
  {
    value: "create_publish",
    label: "Create / Publish",
    description: "Tạo artifact có thể dạy lại hoặc xuất bản sau review.",
  },
  {
    value: "fast_entertaining",
    label: "Fast & Entertaining",
    description: "Ngắn, nhẹ, nhưng vẫn có kiểm tra hiểu thật.",
  },
  {
    value: "prove_impact",
    label: "Prove & Impact",
    description: "Tập trung bằng chứng và tác động có thể kiểm chứng.",
  },
] as const;

const COLOR_TOKENS = [
  {
    name: "Midnight 900",
    token: "--midnight-900",
    value: "#07111f",
    usage: "Nền chính của ứng dụng và Storybook.",
  },
  {
    name: "Midnight 700",
    token: "--midnight-700",
    value: "#0e2237",
    usage: "Panel, input và lớp bề mặt trên nền tối.",
  },
  {
    name: "Emerald 500",
    token: "--emerald-500",
    value: "#12b981",
    usage: "Tăng trưởng, trạng thái đạt và hành động tích cực.",
    light: true,
  },
  {
    name: "Gold 400",
    token: "--gold-400",
    value: "#ffb703",
    usage: "XP, Brew, Boss Proof và điểm nhấn thành tựu.",
    light: true,
  },
  {
    name: "Cyan 400",
    token: "--cyan-400",
    value: "#38d5f5",
    usage: "Thông tin, citation, focus và trạng thái đang xử lý.",
    light: true,
  },
  {
    name: "Violet 500",
    token: "--violet-500",
    value: "#8b7cf6",
    usage: "Điểm nhấn sáng tạo/AI, dùng tiết chế.",
  },
  {
    name: "Crimson 500",
    token: "--crimson-500",
    value: "#f04452",
    usage: "Lỗi, policy block và hành động nguy hiểm.",
  },
  {
    name: "Paper",
    token: "--paper",
    value: "#f5f8fc",
    usage: "Nền sáng cho form onboarding và Proof Vault.",
    light: true,
  },
] as const;

const REASON_LABELS: Record<string, string> = {
  high_relevance: "Rất sát input",
  strong_concept_coverage: "Bao phủ concept tốt",
  fits_learning_mode: "Hợp Learning Mode",
  fits_time_budget: "Hợp thời gian",
  source_checked: "Nguồn đã kiểm chứng",
  partially_cited_sources: "Đã gắn nguồn một phần",
};

function SpecimenShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="sb-gon-specimen-shell">
      <div className="section-heading">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="sb-gon-specimen-stack">{children}</div>
    </main>
  );
}

function Foundations() {
  return (
    <SpecimenShell
      eyebrow="Design System · Foundations"
      title="Màu sắc, chữ và nhịp giao diện GON"
      description="Các token dưới đây được lấy trực tiếp từ src/app/globals.css. Storybook không tạo một hệ màu riêng cho sản phẩm."
    >
      <section className="panel" aria-labelledby="color-heading">
        <p className="eyebrow gold">Color tokens</p>
        <h2 id="color-heading">Midnight để tập trung, emerald/gold để ghi nhận tiến bộ</h2>
        <div className="sb-gon-swatch-grid">
          {COLOR_TOKENS.map((color) => (
            <article
              className={`sb-gon-swatch ${"light" in color && color.light ? "sb-gon-swatch--light" : ""}`}
              key={color.token}
              style={{ background: `var(${color.token})` }}
            >
              <strong>{color.name}</strong>
              <code>
                {color.token} · {color.value}
              </code>
              <span>{color.usage}</span>
            </article>
          ))}
        </div>
      </section>

      <div className="grid-two">
        <section className="panel" aria-labelledby="type-heading">
          <p className="eyebrow">Typography</p>
          <h2 id="type-heading">Be Vietnam Pro, rõ ràng cho tiếng Việt</h2>
          <h1>Biến tò mò thành bằng chứng học thật.</h1>
          <h2>Học từ nguồn của bạn, chứng minh bằng artifact của bạn.</h2>
          <h3>Rubric được công bố trước khi nộp bài.</h3>
          <p className="muted">
            Body text dùng 16px/1.55. Eyebrow dùng chữ hoa, letter-spacing rộng và
            không thay thế heading semantic.
          </p>
          <p>
            <span className="sb-gon-inline-code">gon.module-graph/1.0</span>{" "}
            <span className="sb-gon-inline-code">floor(LifetimeXP / 100)</span>
          </p>
        </section>

        <section className="panel" aria-labelledby="shape-heading">
          <p className="eyebrow">Shape & accessibility</p>
          <h2 id="shape-heading">Bo góc lớn, vùng chạm tối thiểu 48px</h2>
          <ul className="sb-gon-token-list">
            <li>
              <span>--radius-s</span>
              <strong>12px</strong>
            </li>
            <li>
              <span>--radius-m</span>
              <strong>16px</strong>
            </li>
            <li>
              <span>--radius-l</span>
              <strong>22px</strong>
            </li>
            <li>
              <span>--max-width</span>
              <strong>1240px</strong>
            </li>
          </ul>
          <div className="sb-gon-radius-demo" style={{ borderRadius: "var(--radius-l)", marginTop: 16 }} />
          <div className="sb-gon-touch-demo" style={{ marginTop: 16 }}>
            Touch target: var(--touch) = 48px
          </div>
          <p className="hint">
            Focus-visible dùng outline cyan 3px. Trạng thái không được truyền đạt
            chỉ bằng màu; luôn có label hoặc text đi kèm.
          </p>
        </section>
      </div>
    </SpecimenShell>
  );
}

function Controls() {
  return (
    <SpecimenShell
      eyebrow="Design System · Controls"
      title="Buttons, badges và panel"
      description="Button chính dành cho hành động tiếp theo. Gold chỉ dùng cho Brew/Boss Proof hoặc thành tựu; badge luôn có chữ để không phụ thuộc duy nhất vào màu."
    >
      <section className="panel stack" aria-labelledby="buttons-heading">
        <div>
          <p className="eyebrow">Buttons</p>
          <h2 id="buttons-heading">Hành động chính, phụ và nguy hiểm</h2>
        </div>
        <div className="button-row">
          <button className="button primary" type="button">
            Tìm hoặc chuẩn bị Brew
          </button>
          <button className="button gold" type="button">
            Bắt đầu Brew
          </button>
          <button className="button secondary" type="button">
            Xem hướng học
          </button>
          <button className="button ghost" type="button">
            Để sau
          </button>
          <button className="button danger" type="button">
            Gửi report
          </button>
          <button className="button primary" type="button" disabled>
            Đang bị khóa
          </button>
        </div>
        <button className="button primary large" type="button">
          Button large cho CTA cuối form
        </button>
      </section>

      <div className="grid-two">
        <section className="panel stack" aria-labelledby="badges-heading">
          <div>
            <p className="eyebrow">Badges</p>
            <h2 id="badges-heading">Trạng thái phải đọc được bằng chữ</h2>
          </div>
          <div className="badge-row">
            <span className="badge success">passed</span>
            <span className="badge success">Private by default</span>
            <span className="badge warning">metadata_only</span>
            <span className="badge warning">AI draft · Cần kiểm chứng</span>
            <span className="badge info">running</span>
            <span className="badge info">768D search contract</span>
            <span className="badge danger">blocked_by_policy</span>
            <span className="badge">draft_private</span>
          </div>
          <p className="muted">
            Không dùng badge success cho claim chưa được kiểm chứng. Ví dụ,
            source-linked không phải issuer-verified.
          </p>
        </section>

        <section className="panel light-panel stack" aria-labelledby="light-panel-heading">
          <div>
            <p className="eyebrow dark">Light panel</p>
            <h2 id="light-panel-heading">Bề mặt sáng cho onboarding và form proof</h2>
          </div>
          <p>
            Panel sáng giúp tách phần xác nhận/nhập liệu quan trọng khỏi nền tối,
            nhưng vẫn giữ cùng radius, button và focus behavior.
          </p>
          <div className="badge-row">
            <span className="badge">18+ self-attestation</span>
            <span className="badge">Không phải xác minh giấy tờ</span>
          </div>
          <button className="button secondary" type="button">
            Hành động phụ trên nền sáng
          </button>
        </section>
      </div>

      <section className="panel hero-panel" aria-labelledby="hero-heading">
        <p className="eyebrow gold">Search anything · Brew what is missing · Prove learning</p>
        <h2 id="hero-heading" style={{ fontSize: "clamp(2rem, 4vw, 3.4rem)" }}>
          Biến tò mò thành bằng chứng học thật.
        </h2>
        <p>
          Hero panel dùng gradient violet/emerald rất tiết chế trên midnight.
          Nội dung phải nói rõ giới hạn hiện tại thay vì hứa hẹn AI hoặc viral.
        </p>
      </section>
    </SpecimenShell>
  );
}

function Forms() {
  const [learningMode, setLearningMode] = useState<string>("create_publish");
  const [personalization, setPersonalization] = useState<"granted" | "denied">("denied");
  const [is18, setIs18] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [answer, setAnswer] = useState(
    "Bằng lời của mình, hook chỉ là cửa vào; mạng lưới chia sẻ và thời điểm mới quyết định nội dung có đi xa hay không.",
  );

  return (
    <SpecimenShell
      eyebrow="Design System · Forms"
      title="Form nhập liệu, Learning Mode và consent"
      description="Mẫu form dùng đúng class của Vs1App. Mọi lựa chọn về footprint phải giải thích phạm vi dữ liệu ngay tại điểm quyết định."
    >
      <div className="workspace-grid">
        <form
          className="panel stack"
          onSubmit={(event) => event.preventDefault()}
          aria-labelledby="project-form-heading"
        >
          <h2 id="project-form-heading">Tạo Learning Project</h2>
          <label className="field">
            <span>Tiêu đề (tùy chọn)</span>
            <input type="text" defaultValue="Vì sao một bài hát viral?" />
          </label>
          <label className="field">
            <span>Text / câu hỏi / chủ đề</span>
            <textarea rows={5} value={answer} onChange={(event) => setAnswer(event.target.value)} />
            <small>Input vừa là truy vấn vừa là Source Artifact có provenance.</small>
          </label>
          <label className="field">
            <span>Mục tiêu học quan sát được</span>
            <input type="text" defaultValue="Tạo infographic giải thích cơ chế lan truyền" />
          </label>
          <fieldset>
            <legend>Learning Mode cho phiên này</legend>
            <div className="mode-grid">
              {LEARNING_MODES.map((mode) => (
                <label key={mode.value}>
                  <input
                    type="radio"
                    name="storybook-learning-mode"
                    value={mode.value}
                    checked={learningMode === mode.value}
                    onChange={() => setLearningMode(mode.value)}
                  />
                  <span>
                    <strong>{mode.label}</strong>
                    <small>{mode.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="field-row three">
            <label className="field">
              <span>Độ sâu</span>
              <select defaultValue="standard">
                <option value="intro">Intro</option>
                <option value="standard">Standard</option>
                <option value="deep">Deep</option>
              </select>
            </label>
            <label className="field">
              <span>Thời gian (phút)</span>
              <input type="number" min={1} max={600} defaultValue={30} />
            </label>
            <label className="field">
              <span>Loại URL bổ sung</span>
              <select defaultValue="youtube_url">
                <option value="website_url">Website</option>
                <option value="youtube_url">YouTube</option>
                <option value="facebook_url">Facebook</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>File/ảnh bổ sung (tùy chọn)</span>
            <input type="file" accept=".pdf,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp" />
            <small>
              Storybook không upload file. Trong app, metadata-only không được
              trình bày như đã đọc toàn bộ nội dung.
            </small>
          </label>
          <button className="button primary large" type="submit">
            Tìm hoặc chuẩn bị Brew
          </button>
        </form>

        <form
          className="panel light-panel stack"
          onSubmit={(event) => event.preventDefault()}
          aria-labelledby="consent-form-heading"
        >
          <div>
            <p className="eyebrow dark">SCR-01 · Onboarding</p>
            <h2 id="consent-form-heading">Xác nhận trước khi tạo dữ liệu học</h2>
          </div>
          <label className="field">
            <span>Mã mời Private Alpha</span>
            <input type="text" defaultValue="GON-STORYBOOK-2026" autoComplete="one-time-code" />
            <small>Mã mẫu chỉ dùng trong Storybook.</small>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={is18} onChange={(event) => setIs18(event.target.checked)} />
            <span>
              Tôi tự xác nhận mình đã đủ 18 tuổi.
              <small>Đây không phải xác minh giấy tờ.</small>
            </span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(event) => setTermsAccepted(event.target.checked)}
            />
            <span>
              Tôi chấp nhận điều khoản Private Alpha (terms-alpha-v1) và chính
              sách riêng tư (privacy-alpha-v1).
            </span>
          </label>
          <fieldset>
            <legend>Cá nhân hóa bằng footprint trong GON</legend>
            <div className="stack">
              <label className="radio-row">
                <input
                  type="radio"
                  name="storybook-personalization"
                  value="granted"
                  checked={personalization === "granted"}
                  onChange={() => setPersonalization("granted")}
                />
                <span>
                  Bật cá nhân hóa
                  <small>
                    Chỉ dùng tín hiệu trong GON; không đọc mạng xã hội bên ngoài.
                  </small>
                </span>
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  name="storybook-personalization"
                  value="denied"
                  checked={personalization === "denied"}
                  onChange={() => setPersonalization("denied")}
                />
                <span>
                  Không dùng footprint
                  <small>
                    Người học vẫn dùng đầy đủ tính năng; ranking mới không dùng
                    dấu vết cá nhân.
                  </small>
                </span>
              </label>
            </div>
          </fieldset>
          <button className="button primary large" type="submit" disabled={!is18 || !termsAccepted}>
            Kích hoạt tài khoản
          </button>
          <p className="hint">
            Trạng thái disabled phải đi kèm lý do rõ ràng từ hai xác nhận bắt buộc
            phía trên.
          </p>
        </form>
      </div>
    </SpecimenShell>
  );
}

function reasonLabel(code: string): string {
  return REASON_LABELS[code] ?? code;
}

function CandidateCard({ candidate }: { candidate: AnyRecord }) {
  const reasons = Array.isArray(candidate.rankingReasonCodes)
    ? candidate.rankingReasonCodes.map(String)
    : [];

  return (
    <article className={`candidate-card ${Number(candidate.rank) <= 3 ? "top" : ""}`}>
      <div className="badge-row">
        <span className="badge warning">#{Number(candidate.rank)}</span>
        <span className="badge info">{String(candidate.format)}</span>
        <span className="badge">{String(candidate.cluster)}</span>
        <span className={`badge ${candidate.sourceStatus === "citation_checked" ? "success" : "warning"}`}>
          {String(candidate.sourceStatus)}
        </span>
      </div>
      <h3>{String(candidate.title)}</h3>
      <p>{String(candidate.promise)}</p>
      <div className="meta-row">
        <span className="badge">{Number(candidate.estimatedMinutes)} phút</span>
        <span className="badge">{String(candidate.difficulty)}</span>
        <span className="badge">{String(candidate.artifactOutcome)}</span>
      </div>
      <p>
        <strong>Lý do xếp hạng:</strong>{" "}
        {reasons.map(reasonLabel).join(", ") || "Theo snapshot hiện tại"}
      </p>
      <button className="button primary" type="button">
        Tạo hành trình của tôi
      </button>
    </article>
  );
}

function ProofCard({ proof }: { proof: AnyRecord }) {
  const proves = Array.isArray(proof.proves) ? proof.proves.map(String) : [];
  const doesNotProve = Array.isArray(proof.doesNotProve)
    ? proof.doesNotProve.map(String)
    : [];

  return (
    <article className="proof-card">
      <span
        className={`badge ${
          proof.verificationLevel === "system_recorded"
            ? "success"
            : proof.verificationLevel === "source_linked"
              ? "info"
              : ""
        }`}
      >
        {String(proof.verificationLevel)}
      </span>
      <h3>{String(proof.title)}</h3>
      <p>{String(proof.description ?? "")}</p>
      <p>
        <strong>Chứng minh:</strong>
      </p>
      <ul>
        {proves.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p>
        <strong>Không chứng minh:</strong>
      </p>
      <ul>
        {doesNotProve.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="muted">
        Private ·{" "}
        {new Intl.DateTimeFormat("vi-VN", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(String(proof.createdAt)))}
        {proof.issuerDisplayName ? ` · Issuer tự khai: ${String(proof.issuerDisplayName)}` : ""}
      </p>
    </article>
  );
}

function LearningCards() {
  const dataset = createGonStorybookDataset("retrieval");
  const candidates = createStorybookCandidates().slice(0, 4);

  return (
    <SpecimenShell
      eyebrow="Design System · Learning patterns"
      title="Candidate Outputs và Proof Vault"
      description="Hai pattern này dùng fixture Storybook và class thật của ứng dụng. CandidateSet chỉ có 6/10 hướng; giao diện phải nói rõ phần thiếu thay vì tạo card trùng lặp."
    >
      <section className="panel" aria-labelledby="candidate-pattern-heading">
        <p className="eyebrow">SCR-05 · Output Explorer</p>
        <h2 id="candidate-pattern-heading">Card phải giải thích vì sao được xếp hạng</h2>
        <p className="muted">
          Mỗi card có format, thời lượng, độ khó, artifact outcome, source status
          và reason codes. Nút Fork tạo Journey riêng tư, không sửa upstream.
        </p>
      </section>
      <div className="candidate-grid">
        {candidates.map((candidate) => (
          <CandidateCard key={String(candidate.id)} candidate={candidate} />
        ))}
      </div>

      <section className="panel" aria-labelledby="proof-pattern-heading">
        <p className="eyebrow">SCR-11 · Proof Vault</p>
        <h2 id="proof-pattern-heading">Mỗi proof phải nói cả điều nó không chứng minh</h2>
        <p className="muted">
          System-recorded chỉ dành cho Boss Proof đạt rubric trong GON. Link
          chứng chỉ/POAP bên ngoài vẫn ở mức source-linked hoặc self-declared.
        </p>
      </section>
      <div className="grid-two">
        {dataset.proofs.map((proof) => (
          <ProofCard key={String(proof.id)} proof={proof} />
        ))}
      </div>
    </SpecimenShell>
  );
}

function LearningPatterns() {
  return (
    <SpecimenShell
      eyebrow="Design System · Learning flow"
      title="Stepper, node tabs, rubric và feedback"
      description="Pattern học tập phải làm rõ điều kiện mở khóa, rubric trước khi nộp và việc XP chỉ được ghi sau khi attempt đạt."
    >
      <section className="panel stack" aria-labelledby="stepper-heading">
        <div>
          <p className="eyebrow">Project stepper</p>
          <h2 id="stepper-heading">Từ input tới proof</h2>
        </div>
        <ol className="stepper">
          <li data-status="completed">input · completed</li>
          <li data-status="in_progress">search_brew · in_progress</li>
          <li data-status="needs_decision">outputs · needs_decision</li>
          <li data-status="not_started">journey · not_started</li>
          <li data-status="not_started">proof · not_started</li>
        </ol>
        <div className="artifact-list">
          <article className="artifact-row">
            <strong>Prompt gốc của người học</strong>
            <small>text · ready · allowed · chunks: 3</small>
            <span className="badge success">ready</span>
          </article>
          <article className="artifact-row">
            <strong>Video YouTube tham chiếu</strong>
            <small>youtube_url · metadata_only · allowed · chunks: 0</small>
            <span className="badge warning">metadata_only</span>
          </article>
        </div>
      </section>

      <section className="panel stack" aria-labelledby="node-heading">
        <div>
          <p className="eyebrow">SCR-07 → SCR-09 · Journey Player</p>
          <h2 id="node-heading">Node bị khóa phải nói rõ prerequisite</h2>
        </div>
        <div className="node-tabs" role="tablist" aria-label="Các bước học mẫu">
          <button type="button" role="tab" aria-selected="false">
            1 · Đọc bằng chứng
          </button>
          <button type="button" role="tab" aria-selected="true">
            2 · Tự giải thích
          </button>
          <button type="button" role="tab" aria-selected="false" disabled>
            3 · Áp dụng bối cảnh mới (đang khóa)
          </button>
          <button type="button" role="tab" aria-selected="false" disabled>
            4 · Boss Proof (đang khóa)
          </button>
        </div>
        <div className="content-block">
          <blockquote>
            Nguồn chỉ hỗ trợ phần claim nằm trong evidence bundle. Metadata của
            video không được trình bày như transcript đã đọc.
          </blockquote>
        </div>
        <div className="rubric-box">
          <h3>Rubric được công bố trước: Truy hồi ý chính</h3>
          <ul>
            <li>
              <strong>covers_core_ideas:</strong> Nêu được các nhóm yếu tố cốt lõi.
            </li>
            <li>
              <strong>explains_limits:</strong> Nêu giới hạn bằng chứng.
            </li>
            <li>
              <strong>own_words:</strong> Diễn đạt bằng lời của người học.
            </li>
          </ul>
        </div>
        <label className="field">
          <span>Bài làm của bạn</span>
          <textarea
            rows={5}
            defaultValue="Hook chỉ là cửa vào; cộng đồng đầu tiên, thời điểm và khả năng remix mới tạo điều kiện lan truyền. Một video chưa đủ để kết luận công thức chung."
          />
        </label>
        <div className="feedback-box" aria-live="polite">
          <h3>Kết quả assessment mẫu</h3>
          <p>Bài làm đạt rubric. XP chỉ được ghi một lần qua ledger phía server.</p>
          <p className="muted">Assessor: deterministic · confidence 0.90</p>
        </div>
        <div className="sample-answer">
          <h3>Đáp án tham chiếu đã mở sau khi nộp</h3>
          <p>
            Sample answer chỉ xuất hiện sau submit theo reveal policy, không nằm
            trong player graph trước khi người học nộp bài.
          </p>
        </div>
      </section>

      <section className="panel" aria-labelledby="timeline-heading">
        <p className="eyebrow">Journey timeline</p>
        <h2 id="timeline-heading">Branch giữ lại dấu vết học</h2>
        <ol className="timeline">
          <li>
            <span aria-hidden="true" />
            <div>
              <strong>Fork module</strong>
              <p>Khóa upstream ModuleVersion và giữ attribution.</p>
            </div>
          </li>
          <li>
            <span aria-hidden="true" />
            <div>
              <strong>Retrieval đạt rubric</strong>
              <p>Server ghi +10 XP vào ledger, mastery chuyển sang Recall.</p>
            </div>
          </li>
          <li>
            <span aria-hidden="true" />
            <div>
              <strong>Boss Proof đang chờ</strong>
              <p>Artifact phải có disclosure trước khi tạo System-recorded Proof.</p>
            </div>
          </li>
        </ol>
      </section>
    </SpecimenShell>
  );
}

function LifelongLevels() {
  const samples = [0, 85, 1_250, 3_500, 9_999, 123_456].map(progressFromXp);
  const formatter = new Intl.NumberFormat("vi-VN");

  return (
    <SpecimenShell
      eyebrow="Design System · Progression"
      title="Lifelong Level không có mức trần"
      description="Mẫu dưới đây gọi trực tiếp progressFromXp của production code. Forever là Era mở từ Lv.35+, sau đó vẫn tiếp tục Lv.36, Lv.37 và cao hơn."
    >
      <section className="panel" aria-labelledby="formula-heading">
        <p className="eyebrow gold">gon-level-v1</p>
        <h2 id="formula-heading">
          NumericLevel = <code>floor(LifetimeXP / 100)</code>
        </h2>
        <p className="muted">
          Level đối chiếu với Lifetime XP đã kiếm được. Storybook không mô phỏng
          ví, token có thể chi tiêu hay thu nhập.
        </p>
      </section>
      <div className="sb-gon-level-grid">
        {samples.map((progress) => (
          <article className="panel" key={progress.lifetimeXp}>
            <p className="eyebrow gold">
              {formatter.format(progress.lifetimeXp)} Lifetime XP
            </p>
            <span className="metric-value">
              Lv.{progress.numericLevel} · {progress.era}
            </span>
            <span
              className="progress-track"
              role="progressbar"
              aria-label={`Tiến độ trong level ${progress.numericLevel}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress.xpInLevel}
            >
              <i style={{ width: `${progress.xpInLevel}%` }} />
            </span>
            <p className="muted">
              Đã có {progress.xpInLevel}/100 XP trong level hiện tại; còn{" "}
              {progress.xpToNextLevel} XP tới Lv.{progress.numericLevel + 1}.
            </p>
          </article>
        ))}
      </div>
      <section className="panel" aria-labelledby="mastery-heading">
        <p className="eyebrow">Topic Mastery tách khỏi Lifelong Level</p>
        <h2 id="mastery-heading">Level trọn đời không thay thế bằng chứng theo concept</h2>
        <div className="mastery-row">
          <span>hook_value</span>
          <strong>Apply · Áp dụng được</strong>
        </div>
        <div className="mastery-row">
          <span>network_diffusion</span>
          <strong>Recall · Truy hồi được</strong>
        </div>
        <div className="mastery-row">
          <span>evidence_and_sources</span>
          <strong>Create · Tạo được bằng chứng</strong>
        </div>
        <div className="ledger-row">
          <span>
            <strong>+35 XP</strong>
            <br />
            <small className="muted">xp.boss_proof_pass.v1 · 23/10/2026</small>
          </span>
          <span className="badge success">posted</span>
        </div>
      </section>
    </SpecimenShell>
  );
}

function FeedbackStates() {
  return (
    <SpecimenShell
      eyebrow="Design System · Feedback"
      title="Thông báo, lỗi, callout và empty state"
      description="Feedback phải cho người học biết điều gì đã xảy ra, điều gì chưa được ghi nhận và bước tiếp theo an toàn là gì."
    >
      <section className="panel stack" aria-labelledby="feedback-heading">
        <div>
          <p className="eyebrow">Inline feedback</p>
          <h2 id="feedback-heading">Không dùng thông báo mơ hồ cho trạng thái quan trọng</h2>
        </div>
        <p className="notice">
          Brew đã tạo ModuleVersion <strong>draft_private</strong>. Module chưa
          được publish cho người khác.
        </p>
        <p className="error-box" role="alert">
          Không tải được workspace. Hãy thử lại; requestId: req_storybook_demo.
        </p>
        <div className="callout">
          <p className="eyebrow gold">Brew Your Topic</p>
          <h3>Brew không tự chạy khi chưa có xác nhận</h3>
          <p>
            Khi người học xác nhận, server kiểm quota, fingerprint và citation
            ngoài evidence bundle trước khi persist bản nháp riêng tư.
          </p>
        </div>
        <div className="feedback-box">
          <h3>Attempt cần sửa, XP chưa được ghi</h3>
          <p>
            Hãy bổ sung giới hạn bằng chứng rồi tạo attempt mới. Attempt đã nộp
            không bị sửa tại chỗ.
          </p>
        </div>
      </section>

      <div className="grid-two">
        <section className="panel" aria-labelledby="empty-heading">
          <p className="eyebrow">Empty states</p>
          <h2 id="empty-heading">Trống nhưng vẫn có đường đi tiếp</h2>
          <div className="empty-state">
            Chưa có CandidateSet. Hãy quay lại Bắt đầu và chạy Search/Brew.
          </div>
          <div className="empty-state" style={{ marginTop: 12 }}>
            Chưa có proof trong Vault. Boss Proof đạt rubric sẽ tạo
            System-recorded Proof.
          </div>
        </section>

        <section className="panel loading-card" aria-labelledby="loading-heading" aria-live="polite">
          <div>
            <p className="eyebrow">Loading</p>
            <h2 id="loading-heading">Đang tải phiên học…</h2>
            <p className="muted">
              GON đang kiểm tra session và trạng thái tài khoản ở server.
            </p>
          </div>
        </section>
      </div>

      <details className="report-box">
        <summary>Báo cáo module này</summary>
        <div className="stack" style={{ marginTop: 16 }}>
          <label className="field">
            <span>Lý do</span>
            <select defaultValue="source_quality">
              <option value="source_quality">Nguồn/citation chưa đáng tin</option>
              <option value="incorrect_content">Nội dung sai</option>
              <option value="copyright">Nghi vấn bản quyền</option>
              <option value="unsafe_content">Nội dung không an toàn</option>
            </select>
          </label>
          <label className="field">
            <span>Chi tiết (tùy chọn)</span>
            <textarea rows={4} placeholder="Mô tả vị trí claim hoặc nguồn cần review…" />
          </label>
          <button className="button danger" type="button">
            Gửi report
          </button>
        </div>
      </details>
    </SpecimenShell>
  );
}

function GonDesignSystem({ variant }: GonDesignSystemProps) {
  switch (variant) {
    case "controls":
      return <Controls />;
    case "forms":
      return <Forms />;
    case "learning-cards":
      return <LearningCards />;
    case "learning-patterns":
      return <LearningPatterns />;
    case "lifelong-levels":
      return <LifelongLevels />;
    case "feedback":
      return <FeedbackStates />;
    case "foundations":
    default:
      return <Foundations />;
  }
}

const meta = {
  title: "Design System/GON",
  component: GonDesignSystem,
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Catalog pattern của GON dùng CSS production trong src/app/globals.css. Vs1App hiện là component nguyên khối nên các specimen này là reference pattern, không phải component library đã được tách riêng.",
      },
    },
  },
  args: {
    variant: "foundations",
  },
  argTypes: {
    variant: {
      description: "Nhóm specimen cần hiển thị.",
      control: "select",
      options: [
        "foundations",
        "controls",
        "forms",
        "learning-cards",
        "learning-patterns",
        "lifelong-levels",
        "feedback",
      ],
    },
  },
} satisfies Meta<typeof GonDesignSystem>;

export default meta;

type Story = StoryObj<typeof meta>;

export const FoundationsStory: Story = {
  name: "01 · Foundations",
  args: { variant: "foundations" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: /Màu sắc, chữ và nhịp giao diện GON/i }),
    ).toBeInTheDocument();
    await expect(canvas.getByText(/--midnight-900/i)).toBeInTheDocument();
  },
};

export const ControlsStory: Story = {
  name: "02 · Buttons, badges và panels",
  args: { variant: "controls" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/AI draft · Cần kiểm chứng/i)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Đang bị khóa/i })).toBeDisabled();
  },
};

export const FormsStory: Story = {
  name: "03 · Forms và consent",
  args: { variant: "forms" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Cá nhân hóa bằng footprint trong GON/i)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: /Kích hoạt tài khoản/i })).toBeDisabled();
  },
};

export const LearningCardsStory: Story = {
  name: "04 · Candidate và Proof cards",
  args: { variant: "learning-cards" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/^system_recorded$/i)).toBeInTheDocument();
    await expect(canvas.getByText(/^source_linked$/i)).toBeInTheDocument();
  },
};

export const LearningPatternsStory: Story = {
  name: "05 · Learning flow patterns",
  args: { variant: "learning-patterns" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Rubric được công bố trước/i)).toBeInTheDocument();
    await expect(canvas.getByText(/Boss Proof đang chờ/i)).toBeInTheDocument();
  },
};

export const LifelongLevelsStory: Story = {
  name: "06 · Lifelong Levels",
  args: { variant: "lifelong-levels" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Lv\.35 · Forever/i)).toBeInTheDocument();
    await expect(canvas.getByText(/Lv\.99 · Forever/i)).toBeInTheDocument();
    await expect(canvas.getByText(/Lv\.1234 · Forever/i)).toBeInTheDocument();
  },
};

export const FeedbackStory: Story = {
  name: "07 · Feedback và empty states",
  args: { variant: "feedback" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("alert")).toHaveTextContent(/Không tải được workspace/i);
    await expect(canvas.getByText(/Chưa có CandidateSet/i)).toBeInTheDocument();
  },
};
