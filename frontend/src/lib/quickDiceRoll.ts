/** Single roll of an s-sided die (1..s). */
export function rollDie(sides: number): number {
  const s = Math.max(1, Math.floor(sides));
  return Math.floor(Math.random() * s) + 1;
}

export type AttackRollResult = { d20: number; bonus: number; total: number; crit: boolean; critFail: boolean };

/** d20 + attack bonus (5e attack roll). */
export function rollAttackVsAc(attackBonus: number): AttackRollResult {
  const d20 = rollDie(20);
  const bonus = Math.floor(attackBonus);
  return {
    d20,
    bonus,
    total: d20 + bonus,
    crit: d20 === 20,
    critFail: d20 === 1,
  };
}

export type DamageRollResult = { total: number; breakdown: string };

/**
 * Pulls the first NdM(+/-M)? segment from free text (e.g. action description) when structured fields are empty.
 */
export function extractDiceNotation(text: string | null | undefined): string | null {
  if (!text || !String(text).trim()) return null;
  const compact = String(text).replace(/\s+/g, "");
  const m = compact.match(/(\d+d\d+(?:[+-]\d+)?)/i);
  return m ? m[1]!.toLowerCase() : null;
}

/**
 * Rolls monster damage from API fields: `damageDice` like "1d8" / "2d6+1", plus optional numeric `damageBonus`.
 */
export function rollMonsterDamage(
  damageDice: string | null | undefined,
  damageBonus: number | null | undefined,
): DamageRollResult {
  const flat = damageBonus != null ? Math.floor(damageBonus) : 0;
  const raw = (damageDice ?? "").replace(/\s+/g, "").toLowerCase();
  if (!raw) {
    return { total: Math.max(0, flat), breakdown: flat ? String(flat) : "0" };
  }
  const m = raw.match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!m) {
    return {
      total: Math.max(0, flat),
      breakdown: flat ? `unparsed “${damageDice}” + ${flat}` : `unparsed “${damageDice}”`,
    };
  }
  const count = Math.min(40, Math.max(1, parseInt(m[1]!, 10)));
  const sides = Math.min(100, Math.max(2, parseInt(m[2]!, 10)));
  const inline = m[3] ? parseInt(m[3], 10) : 0;
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) rolls.push(rollDie(sides));
  const diceSum = rolls.reduce((a, b) => a + b, 0);
  const total = Math.max(0, diceSum + inline + flat);
  const bits: string[] = [];
  bits.push(rolls.length === 1 ? `${rolls[0]}` : `[${rolls.join("+")}]`);
  if (inline) bits.push(inline >= 0 ? `+${inline}` : `${inline}`);
  if (flat) bits.push(`+${flat}`);
  return { total, breakdown: `${bits.join(" ")} = ${total}` };
}
