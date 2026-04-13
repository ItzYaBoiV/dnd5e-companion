/** SRD-style level in this class when the player chooses a subclass (PHB). */
export const SUBCLASS_CHOICE_CLASS_LEVEL: Record<string, number> = {
  barbarian: 3,
  bard: 3,
  cleric: 1,
  druid: 2,
  fighter: 3,
  monk: 3,
  paladin: 3,
  ranger: 3,
  rogue: 3,
  sorcerer: 1,
  warlock: 1,
  wizard: 2,
};

/**
 * PHB Ability Score Improvement at these *class* levels (fighter +6/+14, rogue +10).
 * Open5e tables sometimes omit the ASI row name; level-up still must accept +2 from the client.
 */
export const ASI_CLASS_LEVELS_PHB: Record<string, number[]> = {
  barbarian: [4, 8, 12, 16, 19],
  bard: [4, 8, 12, 16, 19],
  cleric: [4, 8, 12, 16, 19],
  druid: [4, 8, 12, 16, 19],
  fighter: [4, 6, 8, 12, 14, 16, 19],
  monk: [4, 8, 12, 16, 19],
  paladin: [4, 8, 12, 16, 19],
  ranger: [4, 8, 12, 16, 19],
  rogue: [4, 8, 10, 12, 16, 19],
  sorcerer: [4, 8, 12, 16, 19],
  warlock: [4, 8, 12, 16, 19],
  wizard: [4, 8, 12, 16, 19],
};

/** True if the PHB grants ASI (or feat) at this tier in this class. */
export function classTierHasPhbAbilityImprovement(classSlug: string, classTier: number): boolean {
  const L = Math.max(1, Math.min(20, classTier));
  const arr = ASI_CLASS_LEVELS_PHB[classSlug];
  return arr?.includes(L) ?? false;
}

export function isAsiFeatureName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    /ability score improvement/i.test(name) ||
    /ability score increase/i.test(name) ||
    /\basi\b/i.test(name) ||
    (n.includes("ability") && n.includes("score") && (n.includes("improvement") || n.includes("increase")))
  );
}
