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
  return Math.min(9, Math.max(1, Math.ceil(lv / 2)));
}

/** Uses actual spell slot rows (correct for multiclass + warlock). */
export function maxSpellSlotLevelFromSlots(slots: { level: number; total: number }[]): number {
  const tiers = slots.filter((s) => s.total > 0).map((s) => s.level);
  if (tiers.length === 0) return 0;
  return Math.max(...tiers);
}
