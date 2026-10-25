"use client";

import { evaluateKolTier, KOL_HONESTY_NOTICE } from "@/lib/kol-path";

export interface KolPathCardProps {
  /** số output của người học đạt ≥40 điểm xu hướng (backend xu hướng: P05+) */
  hotOutputs: number;
  /** tổng token xu hướng các output của người học (backend xu hướng: P05+) */
  trendToken: number;
  lifetimeXp: number;
  niche?: string;
  /** ghi chú trung thực khi backend chưa có dữ liệu xu hướng */
  dataNote?: string;
}

/**
 * 🌱 Đường KOL ngách — port production của bề mặt đã PO chốt (standalone v2.12).
 * Disclaimer "never fame/income guarantees" là bắt buộc hiển thị.
 */
export function KolPathCard({ hotOutputs, trendToken, lifetimeXp, niche, dataNote }: KolPathCardProps) {
  const evaluation = evaluateKolTier(hotOutputs, trendToken);
  return (
    <section className="panel stack" aria-labelledby="kol-path-heading">
      <div>
        <p className="eyebrow">trending token / XP · niche-KOL path</p>
        <h2 id="kol-path-heading">🌱 Đường KOL ngách</h2>
      </div>
      <div>
        <div className="badge-row">
          <span className="badge success">{evaluation.tier.label} · bậc {evaluation.tier.index}/3</span>
          <span className="badge">🔥 Token xu hướng: {trendToken}</span>
          <span className="badge">🏅 Lifetime XP: {lifetimeXp}</span>
          <span className="badge">🔥 Output ≥40 xu hướng: {hotOutputs}</span>
        </div>
        <p className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={evaluation.progressPct} aria-label={`Tiến độ ${evaluation.tier.label}`}>
          <i style={{ width: `${evaluation.progressPct}%` }} />
        </p>
        <p className="hint">
          {niche ? <>🎯 Ngách: {niche} · </> : null}
          {evaluation.nextStep ? <>Bước tới: {evaluation.nextStep}</> : "Đã đạt bậc cao nhất của giai đoạn này."}
        </p>
        {dataNote ? <p className="hint">{dataNote}</p> : null}
      </div>
      <div className="callout">
        <strong>⚠️ Trung thực:</strong> {KOL_HONESTY_NOTICE}
      </div>
    </section>
  );
}
