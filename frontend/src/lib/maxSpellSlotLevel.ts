/**
 * Approximate highest spell slot level a character can use (SRD-style progression).
 * Used to highlight spells in the picker; table rules still apply for prepared lists.
 * Returns 0 when the class typically has no leveled slots yet at this character level (soft hint).
 */
export function maxSpellSlotLevel(characterLevel: number, spellcastingType: string | null | undefined): number {
  const lv = Math.max(1, Math.min(20, characterLevel));
  const t = spellcastingType ?? "full";
  if (t === "half") {
    const m = Math.floor(lv / 2);
    return m <= 0 ? 0 : Math.min(5, m);
  }
  if (t === "third") {
    const m = Math.floor((lv + 1) / 3);
    return m <= 0 ? 0 : Math.min(5, m);
  }
  // Full caster max spell slot level (PHB p.114)
  if (lv <= 2) return 1;
  if (lv <= 4) return 2;
  if (lv <= 6) return 3;
  if (lv <= 8) return 4;
  if (lv <= 10) return 5;
  if (lv <= 12) return 6;
  if (lv <= 14) return 7;
  if (lv <= 16) return 8;
  return 9;
}

/** Uses actual spell slot rows (correct for multiclass + warlock). */
export function maxSpellSlotLevelFromSlots(slots: { level: number; total: number }[]): number {
  const tiers = slots.filter((s) => s.total > 0).map((s) => s.level);
  if (tiers.length === 0) return 0;
  return Math.max(...tiers);
}
