/**
 * How many spells / cantrips to pick when gaining one level in a class (class level old → new).
 * Mirrors PHB-style tables in levelUpGuide; uses class tier, not total character level.
 */

import { SUBCLASS_CHOICE_LEVEL } from "./levelUpGuide";
import { cantripsDruid, cantripsSorcerer } from "./creationSpellGuide";

function cantripsStandard(level: number): number {
  if (level <= 3) return 3;
  if (level <= 9) return 4;
  return 5;
}

function cantripsBardWarlock(level: number): number {
  if (level <= 3) return 2;
  if (level <= 9) return 3;
  return 4;
}

function cantripsThirdCaster(level: number): number {
  if (level < 3) return 0;
  if (level <= 6) return 2;
  if (level <= 12) return 3;
  if (level <= 18) return 4;
  return 5;
}

const BARD_SPELLS_KNOWN = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22,
];
/** PHB leveled spells known (not cantrips). */
const SORCERER_LEVELED_SPELLS_KNOWN = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15,
];
const WARLOCK_SPELLS_KNOWN = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15,
];
const RANGER_SPELLS_KNOWN = [
  0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11,
];
const THIRD_CASTER_SPELLS_KNOWN = [
  0, 0, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9,
];

function deltaKnown(table: number[], oldLevel: number, newLevel: number): number {
  return table[newLevel - 1] - table[oldLevel - 1];
}

export type SpellLearnBudget = {
  cantrips: number;
  knownSpells: number;
  wizardSpellbook: number;
  isPreparedCaster: boolean;
};

export function needsSubclassChoiceForClassLevel(
  classSlug: string,
  newLevelInClass: number,
  rowSubclass: string | null | undefined,
): boolean {
  const t = SUBCLASS_CHOICE_LEVEL[classSlug];
  return t != null && t === newLevelInClass && !(rowSubclass ?? "").trim();
}

/** Re-export for convenience */
export { SUBCLASS_CHOICE_LEVEL };

/**
 * @param subclassSlugLower — subclass on the class row (or pending pick) for EK / AT detection.
 */
export function getSpellLearnBudget(
  classSlug: string,
  subclassSlugLower: string,
  oldClassLevel: number,
  newClassLevel: number,
): SpellLearnBudget {
  const slug = classSlug;
  const subL = subclassSlugLower.toLowerCase();
  const isEK = slug === "fighter" && subL.includes("eldritch");
  const isAT = slug === "rogue" && subL.includes("arcane");
  const isThirdSlug = slug === "eldritch-knight" || slug === "arcane-trickster";

  let cantrips = 0;
  let knownSpells = 0;
  let wizardSpellbook = 0;
  let isPreparedCaster = false;

  if (slug === "cleric") {
    isPreparedCaster = true;
    cantrips = cantripsStandard(newClassLevel) - cantripsStandard(oldClassLevel);
  } else if (slug === "druid") {
    isPreparedCaster = true;
    cantrips = cantripsDruid(newClassLevel) - cantripsDruid(oldClassLevel);
  } else if (slug === "wizard") {
    isPreparedCaster = true;
    cantrips = cantripsStandard(newClassLevel) - cantripsStandard(oldClassLevel);
    if (newClassLevel > oldClassLevel) wizardSpellbook = 2;
  } else if (slug === "bard" || slug === "warlock") {
    cantrips = cantripsBardWarlock(newClassLevel) - cantripsBardWarlock(oldClassLevel);
    if (slug === "bard") knownSpells = deltaKnown(BARD_SPELLS_KNOWN, oldClassLevel, newClassLevel);
    else knownSpells = deltaKnown(WARLOCK_SPELLS_KNOWN, oldClassLevel, newClassLevel);
  } else if (isEK || isAT || isThirdSlug) {
    cantrips = cantripsThirdCaster(newClassLevel) - cantripsThirdCaster(oldClassLevel);
    knownSpells = deltaKnown(THIRD_CASTER_SPELLS_KNOWN, oldClassLevel, newClassLevel);
  } else if (slug === "sorcerer") {
    cantrips = cantripsSorcerer(newClassLevel) - cantripsSorcerer(oldClassLevel);
    knownSpells = deltaKnown(SORCERER_LEVELED_SPELLS_KNOWN, oldClassLevel, newClassLevel);
  } else if (slug === "ranger" && newClassLevel >= 2) {
    if (oldClassLevel < 2 && newClassLevel >= 2) {
      knownSpells = 2;
    } else if (oldClassLevel >= 2) {
      knownSpells = deltaKnown(RANGER_SPELLS_KNOWN, oldClassLevel, newClassLevel);
    }
  } else if (slug === "paladin" && newClassLevel >= 2) {
    isPreparedCaster = true;
  }

  return { cantrips, knownSpells, wizardSpellbook, isPreparedCaster };
}
