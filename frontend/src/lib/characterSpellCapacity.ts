/**
 * Live PHB/SRD spell caps on the character sheet (single-class only).
 * Multiclass: returns null — limits are not auto-enforced.
 */

import type { Character, CharacterDraft, Spell } from "@/types/dnd";
import { DEFAULT_DRAFT } from "@/types/dnd";
import { getCreationSpellProfile, type CreationSpellProfile } from "@/lib/creationSpellGuide";

export function getLiveSpellProfile(character: Character): CreationSpellProfile | null {
  if (character.computed?.isMulticlass) return null;
  const draft: CharacterDraft = {
    ...DEFAULT_DRAFT,
    step: 1,
    name: character.name,
    raceSlug: character.raceSlug,
    subraceSlug: character.subraceSlug ?? "",
    classSlug: character.classSlug,
    subclassSlug: character.subclassSlug ?? "",
    useMulticlass: false,
    classLevels: [],
    backgroundSlug: character.backgroundSlug,
    alignment: character.alignment,
    level: character.level,
    experiencePoints: character.experiencePoints ?? 0,
    abilityMethod: "manual",
    scores: {
      strength: character.strength,
      dexterity: character.dexterity,
      constitution: character.constitution,
      intelligence: character.intelligence,
      wisdom: character.wisdom,
      charisma: character.charisma,
    },
    chosenSkills: [],
    savingThrows: [],
    personalityTraits: character.personalityTraits ?? "",
    ideals: character.ideals ?? "",
    bonds: character.bonds ?? "",
    flaws: character.flaws ?? "",
    backstory: character.backstory ?? "",
    age: character.age ?? "",
    height: character.height ?? "",
    weight: character.weight ?? "",
    eyes: character.eyes ?? "",
    skin: character.skin ?? "",
    hair: character.hair ?? "",
    allies: character.allies ?? "",
    appearance: character.appearance ?? "",
    startingGoldRoll: 0,
    useStartingEquipment: true,
    startingInventoryDraft: [],
    startingCantripSlugs: [],
    startingLeveledSlugs: [],
    startingWizardPreparedSlugs: [],
    copper: character.copper ?? 0,
    silver: character.silver ?? 0,
    electrum: character.electrum ?? 0,
    gold: character.gold ?? 0,
    platinum: character.platinum ?? 0,
  };
  return getCreationSpellProfile(draft, undefined);
}

export function explainSpellCapacity(
  character: Character,
  spellDetails: Record<string, { level: number }>,
): string | null {
  const p = getLiveSpellProfile(character);
  if (!p) {
    return "Multiclass: spell limits are not auto-enforced — use your rulebook for each class.";
  }
  const cant = character.spells.filter((s) => spellDetails[s.spellSlug]?.level === 0).length;
  const lev = character.spells.filter((s) => (spellDetails[s.spellSlug]?.level ?? 0) > 0).length;
  const overC = cant > p.cantrips;
  const overL = lev > p.leveledSpells;
  const tail = overC || overL ? " (over PHB limit — remove spells or ask your DM.)" : "";
  return `Spell budget: ${cant}/${p.cantrips} cantrips · ${lev}/${p.leveledSpells} leveled (${p.mode === "wizard" ? "spellbook" : p.mode === "prepared" ? "prepared" : "known"})${tail}`;
}

/** Null = allowed or not enforcing; string = block reason for UI. */
export function canAddSpellPreview(
  character: Character,
  spellDetails: Record<string, { level: number }>,
  candidate: Spell,
): string | null {
  const p = getLiveSpellProfile(character);
  if (!p) return null;

  const listOk = candidate.classes?.some((c) => c.toLowerCase() === p.spellListSlug.toLowerCase());
  if (!listOk) {
    return `Not on the ${p.spellListSlug.replace(/-/g, " ")} list for your class.`;
  }

  const cant = character.spells.filter((s) => spellDetails[s.spellSlug]?.level === 0).length;
  const lev = character.spells.filter((s) => (spellDetails[s.spellSlug]?.level ?? 0) > 0).length;

  if (candidate.level === 0) {
    if (cant >= p.cantrips) {
      return `Cantrip limit reached (${p.cantrips} for your level).`;
    }
  } else {
    if (candidate.level > p.maxLeveledSpellLevel) {
      return `Max spell level for your slots is ${p.maxLeveledSpellLevel}.`;
    }
    if (lev >= p.leveledSpells) {
      return p.mode === "wizard"
        ? `Spellbook full (${p.leveledSpells} leveled spells at wizard level ${p.classLevel}).`
        : `Spells known / prepared cap reached (${p.leveledSpells}).`;
    }
  }
  return null;
}
