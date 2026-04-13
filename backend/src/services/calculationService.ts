/**
 * calculationService.ts
 *
 * ══════════════════════════════════════════════════════════════════
 * ALL D&D 5e mechanical calculations live here and NOWHERE else.
 * ══════════════════════════════════════════════════════════════════
 *
 * Rules:
 * - No database calls in this file (pure functions only)
 * - No side effects
 * - Every function is individually testable
 * - Source citations included for each formula
 */

// ── Types ─────────────────────────────────────────────────────────

export type AbilityName =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

export type AbilityScores = Record<AbilityName, number>;
export type AbilityModifiers = Record<AbilityName, number>;

export interface ArmorData {
  category: string;   // "light" | "medium" | "heavy" | "none"
  baseAc: number;
  hasShield: boolean;
  stealthDisadvantage: boolean;
  strengthRequirement: number | null;
}

export interface AttackData {
  weaponSlug: string;
  /** Display name for proficiency token matching (e.g. Open5e prose lists). */
  weaponName?: string;
  /** e.g. "Martial Melee", "Simple Ranged" — from Item.subcategory */
  subcategory?: string | null;
  damageDice: string;
  damageType: string;
  properties: string[];  // "finesse", "thrown", "ranged", etc.
  range: { normal: number; long: number } | null;
  magical: boolean;
  magicBonus: number;
}

/**
 * Match SRD/Open5e proficiency strings (often one comma-separated blob per class) to a weapon.
 */
export function matchesWeaponProficiency(
  weaponSlug: string,
  weaponName: string,
  subcategory: string | null | undefined,
  proficiencies: string[],
): boolean {
  const tokens = proficiencies.flatMap((p) =>
    p
      .split(/[,&]/)
      .map((s) => s.toLowerCase().trim())
      .filter(Boolean),
  );
  const slugL = weaponSlug.toLowerCase();
  const nameL = weaponName.toLowerCase();
  const subL = (subcategory || "").toLowerCase();

  for (const t of tokens) {
    const asSlug = t.replace(/\s+/g, "-");
    if (asSlug === slugL || t === nameL) return true;
  }

  if (subL.includes("simple") && tokens.some((x) => x.includes("simple"))) return true;
  if (subL.includes("martial") && tokens.some((x) => x.includes("martial"))) return true;
  return false;
}

export interface ComputedCharacterStats {
  // Modifiers
  modifiers: AbilityModifiers;
  // Proficiency
  proficiencyBonus: number;
  // Skills
  skills: Record<string, SkillResult>;
  // Saves
  savingThrows: Record<AbilityName, SavingThrowResult>;
  // Combat
  armorClass: number;
  initiative: number;
  passivePerception: number;
  passiveInsight: number;
  passiveInvestigation: number;
  // Carry
  carryingCapacity: number;
  pushDragLift: number;
  // Spellcasting
  spellSaveDc: number | null;
  spellAttackBonus: number | null;
  // HP
  hpMax: number;  // re-validated
}

export interface SkillResult {
  ability: AbilityName;
  modifier: number;
  proficient: boolean;
  expertise: boolean;
  bonus: number;  // total bonus to add to d20
}

export interface SavingThrowResult {
  modifier: number;
  proficient: boolean;
  bonus: number;
}

export interface AttackResult {
  attackBonus: number;
  damageDice: string;
  damageBonus: number;
  damageType: string;
  isProficient: boolean;
  isRanged: boolean;
  isFinesse: boolean;
  abilityUsed: AbilityName;
}

// ── Skill → Ability Mapping (PHB p.174) ───────────────────────────

export const SKILL_ABILITY_MAP: Record<string, AbilityName> = {
  acrobatics:      "dexterity",
  "animal-handling": "wisdom",
  arcana:          "intelligence",
  athletics:       "strength",
  deception:       "charisma",
  history:         "intelligence",
  insight:         "wisdom",
  intimidation:    "charisma",
  investigation:   "intelligence",
  medicine:        "wisdom",
  nature:          "intelligence",
  perception:      "wisdom",
  performance:     "charisma",
  persuasion:      "charisma",
  religion:        "intelligence",
  "sleight-of-hand": "dexterity",
  stealth:         "dexterity",
  survival:        "wisdom",
} as const;

// ── Core Formulas ─────────────────────────────────────────────────

/**
 * Ability modifier from score.
 * PHB p.173: floor((score - 10) / 2)
 */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * All ability modifiers from scores object.
 */
export function allModifiers(scores: AbilityScores): AbilityModifiers {
  return {
    strength:     abilityModifier(scores.strength),
    dexterity:    abilityModifier(scores.dexterity),
    constitution: abilityModifier(scores.constitution),
    intelligence: abilityModifier(scores.intelligence),
    wisdom:       abilityModifier(scores.wisdom),
    charisma:     abilityModifier(scores.charisma),
  };
}

/**
 * Proficiency bonus from character level.
 * PHB p.15: +2 at level 1–4, +3 at 5–8, +4 at 9–12, +5 at 13–16, +6 at 17–20
 * Formula: ceil(level / 4) + 1
 */
export function proficiencyBonus(level: number): number {
  if (level < 1 || level > 20) {
    throw new Error(`Invalid level: ${level}. Must be 1–20.`);
  }
  return Math.ceil(level / 4) + 1;
}

// ── Skill Calculations ────────────────────────────────────────────

/**
 * Compute full skill bonus.
 * PHB p.174
 */
export function skillBonus(
  skillSlug: string,
  modifiers: AbilityModifiers,
  profBonus: number,
  proficiencies: string[],
  expertise: string[]
): SkillResult {
  const ability = SKILL_ABILITY_MAP[skillSlug];
  if (!ability) throw new Error(`Unknown skill: ${skillSlug}`);

  const mod      = modifiers[ability];
  const isProficient = proficiencies.includes(skillSlug);
  const isExpertise  = expertise.includes(skillSlug);

  let bonus = mod;
  if (isExpertise)  bonus += profBonus * 2;
  else if (isProficient) bonus += profBonus;

  return { ability, modifier: mod, proficient: isProficient, expertise: isExpertise, bonus };
}

/**
 * All skills at once.
 */
export function allSkills(
  modifiers: AbilityModifiers,
  profBonus: number,
  proficiencies: string[],
  expertise: string[]
): Record<string, SkillResult> {
  const result: Record<string, SkillResult> = {};
  for (const slug of Object.keys(SKILL_ABILITY_MAP)) {
    result[slug] = skillBonus(slug, modifiers, profBonus, proficiencies, expertise);
  }
  return result;
}

// ── Saving Throws ─────────────────────────────────────────────────

/**
 * Single saving throw bonus.
 * PHB p.179
 */
export function savingThrowBonus(
  ability: AbilityName,
  modifiers: AbilityModifiers,
  profBonus: number,
  proficiencies: string[]
): SavingThrowResult {
  const mod = modifiers[ability];
  const isProficient = proficiencies.includes(ability);
  const bonus = mod + (isProficient ? profBonus : 0);
  return { modifier: mod, proficient: isProficient, bonus };
}

/**
 * All saving throws at once.
 */
export function allSavingThrows(
  modifiers: AbilityModifiers,
  profBonus: number,
  proficiencies: string[]
): Record<AbilityName, SavingThrowResult> {
  const abilities: AbilityName[] = [
    "strength","dexterity","constitution","intelligence","wisdom","charisma"
  ];
  const result = {} as Record<AbilityName, SavingThrowResult>;
  for (const ab of abilities) {
    result[ab] = savingThrowBonus(ab, modifiers, profBonus, proficiencies);
  }
  return result;
}

// ── Armor Class ───────────────────────────────────────────────────

/**
 * Armor class calculation.
 * PHB p.144-145
 *
 * Handles:
 * - No armor: 10 + DEX mod
 * - Light armor: base + DEX mod
 * - Medium armor: base + min(DEX mod, 2)
 * - Heavy armor: base (no DEX)
 * - Shield: +2 to any of the above
 * - Unarmored Defense (Barbarian): 10 + DEX + CON (pass via acBonus)
 * - Unarmored Defense (Monk): 10 + DEX + WIS (pass via acBonus)
 * - Natural Armor / Mage Armor: handled by setting category and baseAc
 */
export function armorClass(
  armor: ArmorData | null,
  modifiers: AbilityModifiers,
  bonuses: number = 0
): number {
  const dex = modifiers.dexterity;
  let ac: number;

  if (!armor || armor.category === "none") {
    ac = 10 + dex;
  } else if (armor.category === "light") {
    ac = armor.baseAc + dex;
  } else if (armor.category === "medium") {
    ac = armor.baseAc + Math.min(dex, 2);
  } else if (armor.category === "heavy") {
    ac = armor.baseAc;
  } else {
    ac = 10 + dex; // fallback
  }

  if (armor?.hasShield) ac += 2;
  ac += bonuses;

  return ac;
}

// ── Passive Scores ────────────────────────────────────────────────

/**
 * Passive score = 10 + relevant skill bonus.
 * PHB p.175
 */
export function passiveScore(skillBonusValue: number): number {
  return 10 + skillBonusValue;
}

// ── Spellcasting ──────────────────────────────────────────────────

/**
 * Spell save DC.
 * PHB p.205: 8 + proficiency bonus + spellcasting ability modifier
 */
export function spellSaveDc(
  spellcastingAbility: AbilityName,
  modifiers: AbilityModifiers,
  profBonus: number
): number {
  return 8 + profBonus + modifiers[spellcastingAbility];
}

/**
 * Spell attack bonus.
 * PHB p.205: proficiency bonus + spellcasting ability modifier
 */
export function spellAttackBonus(
  spellcastingAbility: AbilityName,
  modifiers: AbilityModifiers,
  profBonus: number
): number {
  return profBonus + modifiers[spellcastingAbility];
}

// ── Weapon Attacks ────────────────────────────────────────────────

/**
 * Compute attack bonus and damage bonus for a weapon attack.
 * PHB p.194-196
 *
 * - Melee weapons: STR mod (or DEX mod if finesse + DEX is higher)
 * - Ranged weapons: DEX mod (or STR mod if thrown + STR is higher)
 * - Finesse: choose higher of STR or DEX for both attack and damage
 */
export function weaponAttack(
  weapon: AttackData,
  modifiers: AbilityModifiers,
  profBonus: number,
  weaponProficiencies: string[]
): AttackResult {
  const isRanged  = weapon.range !== null && !weapon.properties.includes("thrown");
  const isFinesse = weapon.properties.includes("finesse");
  const isThrown  = weapon.properties.includes("thrown");

  let abilityUsed: AbilityName;

  if (isFinesse) {
    // Finesse: choose STR or DEX, whichever is higher (PHB p.147)
    abilityUsed = modifiers.strength >= modifiers.dexterity ? "strength" : "dexterity";
  } else if (isRanged || (isThrown && modifiers.dexterity > modifiers.strength)) {
    abilityUsed = "dexterity";
  } else {
    abilityUsed = "strength";
  }

  const isProficient = matchesWeaponProficiency(
    weapon.weaponSlug,
    weapon.weaponName ?? weapon.weaponSlug,
    weapon.subcategory ?? null,
    weaponProficiencies,
  );

  const abilityMod   = modifiers[abilityUsed];
  const attackBonus  = abilityMod + (isProficient ? profBonus : 0) + weapon.magicBonus;
  const damageBonus  = abilityMod + weapon.magicBonus;

  return {
    attackBonus,
    damageDice: weapon.damageDice,
    damageBonus,
    damageType: weapon.damageType,
    isProficient,
    isRanged,
    isFinesse,
    abilityUsed,
  };
}

// ── Carrying Capacity ─────────────────────────────────────────────

/**
 * Carrying capacity in pounds.
 * PHB p.176: strength score × 15
 */
export function carryingCapacity(strengthScore: number): number {
  return strengthScore * 15;
}

/**
 * Push, drag, or lift limit.
 * PHB p.176: 2 × carrying capacity
 */
export function pushDragLift(strengthScore: number): number {
  return carryingCapacity(strengthScore) * 2;
}

// ── HP ────────────────────────────────────────────────────────────

/**
 * Maximum HP for a character.
 * PHB p.12: hit die max at level 1, then average+1 (or roll) for each subsequent level.
 *
 * Standard: max die at level 1, then floor(die/2)+1 each level thereafter.
 * conMod applied each level.
 */
export function maxHpStandard(
  hitDie: number,
  constitutionMod: number,
  level: number
): number {
  const firstLevel = hitDie + constitutionMod;
  const subsequentLevels = Math.max(0, level - 1) * (Math.floor(hitDie / 2) + 1 + constitutionMod);
  return Math.max(1, firstLevel + subsequentLevels);
}

// ── Initiative ────────────────────────────────────────────────────

/**
 * Initiative modifier.
 * PHB p.177: dexterity modifier (+ any bonuses from features like Alert feat)
 */
export function initiativeModifier(
  modifiers: AbilityModifiers,
  bonuses: number = 0
): number {
  return modifiers.dexterity + bonuses;
}

// ── Spell Slots per Level (by class and character level) ──────────

/**
 * Full caster spell slots table (PHB p.114, 205, etc.)
 * Index: [characterLevel - 1][spellLevel - 1]
 */
export const FULL_CASTER_SLOTS: number[][] = [
  //  1  2  3  4  5  6  7  8  9
  [   2, 0, 0, 0, 0, 0, 0, 0, 0 ], // level 1
  [   3, 0, 0, 0, 0, 0, 0, 0, 0 ], // level 2
  [   4, 2, 0, 0, 0, 0, 0, 0, 0 ], // level 3
  [   4, 3, 0, 0, 0, 0, 0, 0, 0 ], // level 4
  [   4, 3, 2, 0, 0, 0, 0, 0, 0 ], // level 5
  [   4, 3, 3, 0, 0, 0, 0, 0, 0 ], // level 6
  [   4, 3, 3, 1, 0, 0, 0, 0, 0 ], // level 7
  [   4, 3, 3, 2, 0, 0, 0, 0, 0 ], // level 8
  [   4, 3, 3, 3, 1, 0, 0, 0, 0 ], // level 9
  [   4, 3, 3, 3, 2, 0, 0, 0, 0 ], // level 10
  [   4, 3, 3, 3, 2, 1, 0, 0, 0 ], // level 11
  [   4, 3, 3, 3, 2, 1, 0, 0, 0 ], // level 12
  [   4, 3, 3, 3, 2, 1, 1, 0, 0 ], // level 13
  [   4, 3, 3, 3, 2, 1, 1, 0, 0 ], // level 14
  [   4, 3, 3, 3, 2, 1, 1, 1, 0 ], // level 15
  [   4, 3, 3, 3, 2, 1, 1, 1, 0 ], // level 16
  [   4, 3, 3, 3, 2, 1, 1, 1, 1 ], // level 17
  [   4, 3, 3, 3, 3, 1, 1, 1, 1 ], // level 18
  [   4, 3, 3, 3, 3, 2, 1, 1, 1 ], // level 19
  [   4, 3, 3, 3, 3, 2, 2, 1, 1 ], // level 20
];

/**
 * Half caster spell slots (Paladin, Ranger).
 * They start getting slots at level 2; class level ÷ 2 (rounded down) gives caster level.
 */
export const HALF_CASTER_SLOTS: number[][] = [
  //  1  2  3  4  5
  [   0, 0, 0, 0, 0 ], // level 1 — no slots
  [   2, 0, 0, 0, 0 ], // level 2
  [   3, 0, 0, 0, 0 ], // level 3
  [   3, 0, 0, 0, 0 ], // level 4
  [   4, 2, 0, 0, 0 ], // level 5
  [   4, 2, 0, 0, 0 ], // level 6
  [   4, 3, 0, 0, 0 ], // level 7
  [   4, 3, 0, 0, 0 ], // level 8
  [   4, 3, 2, 0, 0 ], // level 9
  [   4, 3, 2, 0, 0 ], // level 10
  [   4, 3, 3, 0, 0 ], // level 11
  [   4, 3, 3, 0, 0 ], // level 12
  [   4, 3, 3, 1, 0 ], // level 13
  [   4, 3, 3, 1, 0 ], // level 14
  [   4, 3, 3, 2, 0 ], // level 15
  [   4, 3, 3, 2, 0 ], // level 16
  [   4, 3, 3, 3, 1 ], // level 17
  [   4, 3, 3, 3, 1 ], // level 18
  [   4, 3, 3, 3, 2 ], // level 19
  [   4, 3, 3, 3, 2 ], // level 20
];

/**
 * Warlock pact magic slots (PHB p.107).
 * Always one slot level; all slots recovered on short rest.
 */
export const PACT_MAGIC_SLOTS: { slots: number; level: number }[] = [
  { slots: 1, level: 1 }, // level 1
  { slots: 2, level: 1 }, // level 2
  { slots: 2, level: 2 }, // level 3
  { slots: 2, level: 2 }, // level 4
  { slots: 2, level: 3 }, // level 5
  { slots: 2, level: 3 }, // level 6
  { slots: 2, level: 4 }, // level 7
  { slots: 2, level: 4 }, // level 8
  { slots: 2, level: 5 }, // level 9
  { slots: 2, level: 5 }, // level 10
  { slots: 3, level: 5 }, // level 11
  { slots: 3, level: 5 }, // level 12
  { slots: 3, level: 5 }, // level 13
  { slots: 3, level: 5 }, // level 14
  { slots: 3, level: 5 }, // level 15
  { slots: 3, level: 5 }, // level 16
  { slots: 4, level: 5 }, // level 17
  { slots: 4, level: 5 }, // level 18
  { slots: 4, level: 5 }, // level 19
  { slots: 4, level: 5 }, // level 20
];

export function spellSlotsForClass(
  classSlug: string,
  level: number
): { level: number; total: number }[] {
  const idx = level - 1;

  if (classSlug === "warlock") {
    const row = PACT_MAGIC_SLOTS[idx];
    return [{ level: row.level, total: row.slots }];
  }

  const halfCasters = ["paladin", "ranger"];
  const thirdCasters = ["arcane-trickster", "eldritch-knight"];

  let table: number[][];
  if (halfCasters.includes(classSlug)) {
    table = HALF_CASTER_SLOTS;
  } else if (thirdCasters.includes(classSlug)) {
    // Third casters use floor(level/3) as their caster level
    const casterLevel = Math.max(0, Math.floor(level / 3));
    if (casterLevel === 0) return [];
    table = FULL_CASTER_SLOTS; // use full table at reduced level
    return table[casterLevel - 1]
      .map((total, i) => ({ level: i + 1, total }))
      .filter((s) => s.total > 0);
  } else {
    // Full casters: Bard, Cleric, Druid, Sorcerer, Wizard
    table = FULL_CASTER_SLOTS;
  }

  return table[idx]
    .map((total, i) => ({ level: i + 1, total }))
    .filter((s) => s.total > 0);
}

// ── Multiclass spell slots (PHB p.164) ────────────────────────────

/** Classes that contribute 1:1 to multiclass spellcaster level (SRD). */
const MULTICLASS_FULL_CASTERS = new Set([
  "bard",
  "cleric",
  "druid",
  "sorcerer",
  "wizard",
]);

export type MulticlassSlice = {
  classSlug: string;
  subclassSlug?: string | null;
  levels: number;
};

/**
 * One class's contribution to multiclass spellcaster level (before capping total).
 * Warlock uses Pact Magic only and does not add to this pool.
 */
export function multiclassSpellcasterContribution(slice: MulticlassSlice): number {
  const slug = slice.classSlug;
  const lv = slice.levels;
  const subL = (slice.subclassSlug ?? "").toLowerCase();
  if (slug === "warlock") return 0;
  if (slug === "fighter" && subL.includes("eldritch")) return Math.floor(lv / 3);
  if (slug === "rogue" && subL.includes("arcane")) return Math.floor(lv / 3);
  if (slug === "paladin" || slug === "ranger") return Math.floor(lv / 2);
  if (MULTICLASS_FULL_CASTERS.has(slug)) return lv;
  return 0;
}

/** Combined spellcaster level for the multiclass spell slot table (max 20). */
export function multiclassSpellcasterLevel(slices: MulticlassSlice[]): number {
  const raw = slices.reduce((s, c) => s + multiclassSpellcasterContribution(c), 0);
  return Math.max(0, Math.min(20, raw));
}

export function totalWarlockLevels(slices: MulticlassSlice[]): number {
  return slices.filter((c) => c.classSlug === "warlock").reduce((s, c) => s + c.levels, 0);
}

/**
 * Merged spell slots: multiclass Spellcasting table + Warlock pact slots (same slot level stacks).
 */
export function spellSlotsForMulticlass(slices: MulticlassSlice[]): { level: number; total: number }[] {
  const casterLv = multiclassSpellcasterLevel(slices);
  const wl = totalWarlockLevels(slices);
  const byLevel = new Map<number, number>();

  if (casterLv >= 1) {
    const row = FULL_CASTER_SLOTS[casterLv - 1];
    for (let i = 0; i < row.length; i++) {
      const t = row[i];
      if (t > 0) byLevel.set(i + 1, t);
    }
  }

  if (wl >= 1) {
    const pact = PACT_MAGIC_SLOTS[wl - 1];
    const L = pact.level;
    byLevel.set(L, (byLevel.get(L) ?? 0) + pact.slots);
  }

  return Array.from(byLevel.entries())
    .map(([level, total]) => ({ level, total }))
    .sort((a, b) => a.level - b.level);
}

/**
 * Max HP for a multiclass character built in segment order (PHB p.163).
 * `ordered` = class segments top to bottom; first character level uses max die, later levels use average.
 */
export function maxHpMulticlass(
  ordered: { classSlug: string; levels: number }[],
  hitDieByClassSlug: Record<string, number>,
  constitutionMod: number,
): number {
  let hp = 0;
  let firstLevelOverall = true;
  for (const seg of ordered) {
    const die = hitDieByClassSlug[seg.classSlug] ?? 8;
    for (let i = 0; i < seg.levels; i++) {
      if (firstLevelOverall) {
        hp += die + constitutionMod;
        firstLevelOverall = false;
      } else {
        hp += Math.floor(die / 2) + 1 + constitutionMod;
      }
    }
  }
  return Math.max(1, hp);
}

// ── Dice rolling (server-side when needed) ────────────────────────

/**
 * Roll a single die. Used for server-side rolls only.
 * Clients should roll their own dice for transparency.
 */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Parse and roll a dice expression like "2d6+3" or "1d4".
 */
export function rollDiceExpression(expr: string): { total: number; rolls: number[]; bonus: number } {
  const match = expr.toLowerCase().match(/^(\d+)d(\d+)([+-]\d+)?$/);
  if (!match) throw new Error(`Invalid dice expression: ${expr}`);

  const count  = parseInt(match[1], 10);
  const sides  = parseInt(match[2], 10);
  const bonus  = match[3] ? parseInt(match[3], 10) : 0;
  const rolls  = Array.from({ length: count }, () => rollDie(sides));
  const total  = rolls.reduce((a, b) => a + b, 0) + bonus;

  return { total, rolls, bonus };
}

// ── Point Buy ─────────────────────────────────────────────────────

/**
 * Point buy cost table (PHB p.13).
 * Score 8–15 allowed; total budget is 27 points.
 */
export const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

export function pointBuyCost(scores: Partial<AbilityScores>): number {
  return Object.values(scores).reduce((total, score) => {
    const cost = POINT_BUY_COST[score ?? 8];
    if (cost === undefined) throw new Error(`Score ${score} is out of point buy range (8–15)`);
    return total + cost;
  }, 0);
}

export const POINT_BUY_BUDGET = 27;

export function isValidPointBuy(scores: AbilityScores): boolean {
  const values = Object.values(scores);
  if (values.some((s) => s < 8 || s > 15)) return false;
  return pointBuyCost(scores) <= POINT_BUY_BUDGET;
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;
