import type { AbilityName, AbilityScores, Race } from "@/types/dnd";
import { ABILITY_NAMES } from "@/types/dnd";

/** Apply race + optional subrace bonuses to base scores (cap 1–20). */
export function scoresAfterRace(base: AbilityScores, race: Race | undefined, subraceSlug: string): AbilityScores {
  if (!race) return { ...base };
  const sub = race.subraces.find((s) => s.slug === subraceSlug);
  const add: Partial<Record<AbilityName, number>> = {};
  for (const b of race.abilityBonuses) {
    add[b.ability] = (add[b.ability] ?? 0) + b.bonus;
  }
  if (sub) {
    for (const b of sub.abilityBonuses) {
      add[b.ability] = (add[b.ability] ?? 0) + b.bonus;
    }
  }
  const out = { ...base };
  for (const a of ABILITY_NAMES) {
    out[a] = Math.min(20, Math.max(1, base[a] + (add[a] ?? 0)));
  }
  return out;
}

/** Undo `scoresAfterRace`: derive base scores (before racial bonuses) from totals on a filled sheet. */
export function scoresBaseBeforeRace(
  finalScores: AbilityScores,
  race: Race | undefined,
  subraceSlug: string,
): AbilityScores {
  if (!race) return { ...finalScores };
  const sub = race.subraces.find((s) => s.slug === subraceSlug);
  const add: Partial<Record<AbilityName, number>> = {};
  for (const b of race.abilityBonuses) {
    add[b.ability] = (add[b.ability] ?? 0) + b.bonus;
  }
  if (sub) {
    for (const b of sub.abilityBonuses) {
      add[b.ability] = (add[b.ability] ?? 0) + b.bonus;
    }
  }
  const out = { ...finalScores };
  for (const a of ABILITY_NAMES) {
    out[a] = Math.min(20, Math.max(1, finalScores[a] - (add[a] ?? 0)));
  }
  return out;
}

/**
 * Walking speed shown for the character after common subrace overrides (race card still shows base race speed).
 */
export function walkingSpeedAfterSubrace(
  race: Race | undefined,
  subraceSlug: string | undefined | null,
): number {
  if (!race) return 30;
  const base = typeof race.speed === "number" && race.speed > 0 ? race.speed : 30;
  if (race.slug === "elf" && (subraceSlug ?? "").trim().toLowerCase() === "wood-elf") return 35;
  return base;
}

/** SRD-style standard array (same order as wizard). */
export const STANDARD_ARRAY_VALUES = [15, 14, 13, 12, 10, 8] as const;

/**
 * Rough class priorities for a friendly "best for this class" layout (SRD-focused).
 * First entries get the highest numbers from the standard array.
 */
const CLASS_SCORE_PRIORITY: Record<string, AbilityName[]> = {
  barbarian:  ["strength", "constitution", "dexterity", "wisdom", "charisma", "intelligence"],
  bard:       ["charisma", "dexterity", "constitution", "wisdom", "intelligence", "strength"],
  cleric:     ["wisdom", "constitution", "strength", "charisma", "dexterity", "intelligence"],
  druid:      ["wisdom", "constitution", "dexterity", "intelligence", "charisma", "strength"],
  fighter:    ["strength", "constitution", "dexterity", "wisdom", "charisma", "intelligence"],
  monk:       ["dexterity", "wisdom", "constitution", "strength", "charisma", "intelligence"],
  paladin:    ["strength", "charisma", "constitution", "wisdom", "dexterity", "intelligence"],
  ranger:     ["dexterity", "wisdom", "constitution", "strength", "intelligence", "charisma"],
  rogue:      ["dexterity", "intelligence", "constitution", "charisma", "wisdom", "strength"],
  sorcerer:   ["charisma", "constitution", "dexterity", "wisdom", "intelligence", "strength"],
  warlock:    ["charisma", "constitution", "dexterity", "wisdom", "intelligence", "strength"],
  wizard:     ["intelligence", "constitution", "dexterity", "wisdom", "charisma", "strength"],
};

function priorityForClass(classSlug: string, primaryHint: string): AbilityName[] {
  const fromTable = CLASS_SCORE_PRIORITY[classSlug.toLowerCase().replace(/_/g, "-")];
  if (fromTable) return [...fromTable];

  const hint = primaryHint.toLowerCase();
  const picked: AbilityName[] = [];
  for (const a of ABILITY_NAMES) {
    if (hint.includes(a.slice(0, 3)) || hint.includes(a)) picked.push(a);
  }
  for (const a of ABILITY_NAMES) {
    if (!picked.includes(a)) picked.push(a);
  }
  return picked;
}

/** One valid standard-array assignment biased toward the class (base scores, before race). */
export function suggestedStandardArrayScores(
  classSlug: string,
  primaryAbilityHint: string,
): AbilityScores {
  const order = priorityForClass(classSlug, primaryAbilityHint);
  const values = [...STANDARD_ARRAY_VALUES].sort((a, b) => b - a);
  const scores = {} as AbilityScores;
  for (let i = 0; i < ABILITY_NAMES.length; i++) {
    scores[order[i]] = values[i] ?? 8;
  }
  return scores;
}

/** Kid-friendly one-liners (SRD terms, plain language). */
export const ABILITY_SCORE_KID_HELP: Record<AbilityName, string> = {
  strength:
    "How strong you are — climbing, kicking open doors, and hitting with heavy weapons.",
  dexterity:
    "How quick and nimble you are — sneaking, dodging, and using bows or finesse weapons.",
  constitution:
    "How tough and healthy you are — stamina and how many hit points you get.",
  intelligence:
    "How well you learn and reason — arcane magic, puzzles, and many knowledge skills.",
  wisdom:
    "How aware and intuitive you are — noticing things, survival, and many divine powers.",
  charisma:
    "How forceful your personality is — persuading people, performing, and many magical effects.",
};
