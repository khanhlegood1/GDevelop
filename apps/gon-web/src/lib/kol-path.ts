/**
 * ĐƯỜNG KOL NGÁCH — trending token / XP niche-KOL path (PO decision gốc,
 * đóng vào standalone v2.12 và port sang production trong Apply-1).
 *
 * Quy tắc trung thực bắt buộc (PO): GON KHÔNG BAO GIỜ hứa hẹn nổi tiếng hay
 * thu nhập. Token xu hướng & XP không quy đổi thành tiền — chúng chỉ ghi nhận
 * việc học thật (checkpoint/learningEvents) và đóng góp thật (remix/fork/xu hướng).
 */

export type KolTierId = "sprout" | "niche_owner" | "niche_kol";

export interface KolTier {
  id: KolTierId;
  label: string;
  index: number;
  /** mô tả điều kiện lên tier (hiển thị cho người học) */
  requirement: string;
}

export const KOL_TIERS: readonly KolTier[] = [
  { id: "sprout", label: "🌱 Mầm ngách", index: 1, requirement: "mặc định cho mọi người học thật" },
  { id: "niche_owner", label: "🌿 Chủ ngách", index: 2, requirement: "≥1 output của mình đạt ≥40 điểm xu hướng" },
  { id: "niche_kol", label: "⭐ KOL ngách", index: 3, requirement: "≥3 output ≥40 xu hướng hoặc token xu hướng ≥100" },
] as const;

/** Disclaimer bắt buộc hiển thị cùng mọi bề mặt KOL ngách (never fame/income guarantees). */
export const KOL_HONESTY_NOTICE =
  "GON KHÔNG hứa hẹn nổi tiếng hay thu nhập. Token xu hướng & XP không quy đổi thành tiền, không bảo đảm fame/income — chúng chỉ ghi nhận việc học thật (checkpoint, learningEvents) và đóng góp thật (remix, fork, xu hướng cộng đồng).";

export interface OwnOutputTrend {
  /** điểm xu hướng hiện tại của một output thuộc về người học */
  trend: number;
}

/** Token xu hướng = tổng điểm xu hướng các output CỦA MÌNH (Brew + Remix). */
export function sumTrendToken(outputs: readonly OwnOutputTrend[]): number {
  return outputs.reduce((total, output) => total + (Number.isFinite(output.trend) ? output.trend : 0), 0);
}

export function countHotOutputs(outputs: readonly OwnOutputTrend[], threshold = 40): number {
  return outputs.filter((output) => output.trend >= threshold).length;
}

export interface KolTierEvaluation {
  tier: KolTier;
  /** % tiến độ tới tier kế tiếp (0–100); tier cao nhất = 100 */
  progressPct: number;
  /** mô tả bước tới còn thiếu (rỗng nếu đã ở tier cao nhất) */
  nextStep: string;
}

/**
 * Xếp tier theo metric THẬT (output lên xu hướng, token tổng) — không theo
 * thời gian online, không thể mua. Ngưỡng mirror standalone v2.12.
 */
export function evaluateKolTier(hotOutputs: number, trendToken: number): KolTierEvaluation {
  const hot = Math.max(0, Math.floor(hotOutputs));
  const token = Math.max(0, Math.floor(trendToken));
  if (hot >= 3 || token >= 100) {
    return { tier: KOL_TIERS[2], progressPct: 100, nextStep: "" };
  }
  if (hot >= 1) {
    return {
      tier: KOL_TIERS[1],
      progressPct: Math.min(99, 50 + hot * 15),
      nextStep: `còn ${3 - hot} output ≥40 xu hướng hoặc ${100 - token} token tới ⭐ KOL ngách`,
    };
  }
  return {
    tier: KOL_TIERS[0],
    progressPct: Math.min(49, token),
    nextStep: "1 output của bạn đạt ≥40 điểm xu hướng để lên 🌿 Chủ ngách",
  };
}
