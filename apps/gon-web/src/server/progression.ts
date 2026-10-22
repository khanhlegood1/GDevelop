export const FORMULA_VERSION = "gon-level-v1" as const;

export function eraForLevel(numericLevel: number): string {
  if (numericLevel <= 0) return "Zero";
  if (numericLevel <= 2) return "Awaken";
  if (numericLevel <= 6) return "Explorer";
  if (numericLevel <= 11) return "Guardian";
  if (numericLevel <= 19) return "Hero";
  if (numericLevel <= 34) return "Legend";
  return "Forever";
}

export interface LifelongProgress {
  lifetimeXp: number;
  numericLevel: number;
  era: string;
  xpInLevel: number;
  xpToNextLevel: number;
  formulaVersion: typeof FORMULA_VERSION;
}

export function progressFromXp(lifetimeXp: number): LifelongProgress {
  const safeXp = Math.max(0, Math.trunc(lifetimeXp));
  const numericLevel = Math.floor(safeXp / 100);
  const xpInLevel = safeXp % 100;
  return {
    lifetimeXp: safeXp,
    numericLevel,
    era: eraForLevel(numericLevel),
    xpInLevel,
    xpToNextLevel: 100 - xpInLevel,
    formulaVersion: FORMULA_VERSION,
  };
}

export const XP_RULE_VALUES: Record<string, number> = {
  "xp.retrieval_pass.v1": 10,
  "xp.transfer_pass.v1": 15,
  "xp.boss_proof_pass.v1": 35,
  "xp.teach_back_pass.v1": 20,
  "xp.delayed_review_pass.v1": 5,
};
