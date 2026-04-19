/**
 * PHB/SRD spell counts for character creation and add-spell limits (single-class and multiclass).
 * Multiclass creation payloads concatenate, per class segment (in sortOrder), cantrips then leveled spells.
 */

import { spellSlotsForClass, type MulticlassSlice } from "./calculationService";
import { prisma } from "../config/database";
import { ValidationError } from "../middleware/errorHandler";

const BARD_SPELLS_KNOWN = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22,
];
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

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function cantripsWizardCleric(level: number): number {
  const L = Math.max(1, Math.min(20, level));
  if (L <= 3) return 3;
  if (L <= 9) return 4;
  return 5;
}

function cantripsDruid(level: number): number {
  const L = Math.max(1, Math.min(20, level));
  if (L <= 3) return 2;
  if (L <= 9) return 3;
  return 4;
}

function cantripsBardWarlock(level: number): number {
  const L = Math.max(1, Math.min(20, level));
  if (L <= 3) return 2;
  if (L <= 9) return 3;
  return 4;
}

function cantripsSorcerer(level: number): number {
  const L = Math.max(1, Math.min(20, level));
  if (L <= 3) return 4;
  if (L <= 10) return 5;
  return 6;
}

function cantripsThirdCaster(level: number): number {
  const L = Math.max(1, Math.min(20, level));
  if (L < 3) return 0;
  if (L <= 6) return 2;
  if (L <= 12) return 3;
  if (L <= 18) return 4;
  return 5;
}

function maxSlotSpellLevel(classSlug: string, subclassSlug: string | null | undefined, classLevel: number): number {
  const L = Math.max(1, Math.min(20, classLevel));
  const slots = spellSlotsForClass(classSlug, L, subclassSlug);
  if (!slots.length) return 0;
  return Math.max(...slots.map((s) => s.level));
}

export type CreationSpellProfileBE = {
  mode: "known" | "wizard" | "prepared";
  classSlug: string;
  spellListSlug: string;
  classLevel: number;
  cantrips: number;
  leveledSpells: number;
  maxLeveledSpellLevel: number;
  preparedFromLeveled: number;
};

function isEK(classSlug: string, sub: string): boolean {
  return classSlug === "fighter" && sub.includes("eldritch");
}

function isAT(classSlug: string, sub: string): boolean {
  return classSlug === "rogue" && sub.includes("arcane");
}

export function getCreationSpellProfileBE(
  classSlug: string,
  subclassSlug: string | null | undefined,
  classLevel: number,
  intelligence: number,
  wisdom: number,
  charisma: number,
): CreationSpellProfileBE | null {
  const slug = classSlug;
  const L = Math.max(1, Math.min(20, classLevel));
  const sub = (subclassSlug ?? "").toLowerCase();
  const intM = mod(intelligence);
  const wisM = mod(wisdom);
  const chaM = mod(charisma);
  const maxLv = maxSlotSpellLevel(slug, subclassSlug, L);

  if (slug === "wizard") {
    const book = 6 + 2 * (L - 1);
    const prep = Math.max(1, intM + L);
    return {
      mode: "wizard",
      classSlug: slug,
      spellListSlug: "wizard",
      classLevel: L,
      cantrips: cantripsWizardCleric(L),
      leveledSpells: book,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: Math.min(book, prep),
    };
  }
  if (slug === "cleric") {
    const prep = Math.max(1, wisM + L);
    return {
      mode: "prepared",
      classSlug: slug,
      spellListSlug: "cleric",
      classLevel: L,
      cantrips: cantripsWizardCleric(L),
      leveledSpells: prep,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: prep,
    };
  }
  if (slug === "druid") {
    const prep = Math.max(1, wisM + L);
    return {
      mode: "prepared",
      classSlug: slug,
      spellListSlug: "druid",
      classLevel: L,
      cantrips: cantripsDruid(L),
      leveledSpells: prep,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: prep,
    };
  }
  if (slug === "bard") {
    return {
      mode: "known",
      classSlug: slug,
      spellListSlug: "bard",
      classLevel: L,
      cantrips: cantripsBardWarlock(L),
      leveledSpells: BARD_SPELLS_KNOWN[L - 1] ?? 0,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: 0,
    };
  }
  if (slug === "sorcerer") {
    return {
      mode: "known",
      classSlug: slug,
      spellListSlug: "sorcerer",
      classLevel: L,
      cantrips: cantripsSorcerer(L),
      leveledSpells: SORCERER_LEVELED_SPELLS_KNOWN[L - 1] ?? 0,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: 0,
    };
  }
  if (slug === "warlock") {
    return {
      mode: "known",
      classSlug: slug,
      spellListSlug: "warlock",
      classLevel: L,
      cantrips: cantripsBardWarlock(L),
      leveledSpells: WARLOCK_SPELLS_KNOWN[L - 1] ?? 0,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: 0,
    };
  }
  if (slug === "ranger" && L >= 2) {
    return {
      mode: "known",
      classSlug: slug,
      spellListSlug: "ranger",
      classLevel: L,
      cantrips: 0,
      leveledSpells: RANGER_SPELLS_KNOWN[L - 1] ?? 0,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: 0,
    };
  }
  if (slug === "paladin" && L >= 2) {
    const prep = Math.max(1, chaM + Math.floor(L / 2));
    return {
      mode: "prepared",
      classSlug: slug,
      spellListSlug: "paladin",
      classLevel: L,
      cantrips: 0,
      leveledSpells: prep,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: prep,
    };
  }
  if (isEK(slug, sub) && L >= 3) {
    return {
      mode: "known",
      classSlug: slug,
      spellListSlug: "wizard",
      classLevel: L,
      cantrips: cantripsThirdCaster(L),
      leveledSpells: THIRD_CASTER_SPELLS_KNOWN[L - 1] ?? 0,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: 0,
    };
  }
  if (isAT(slug, sub) && L >= 3) {
    return {
      mode: "known",
      classSlug: slug,
      spellListSlug: "wizard",
      classLevel: L,
      cantrips: cantripsThirdCaster(L),
      leveledSpells: THIRD_CASTER_SPELLS_KNOWN[L - 1] ?? 0,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: 0,
    };
  }
  return null;
}

export type StartingSpellRow = { spellSlug: string; prepared: boolean; alwaysPrepared: boolean };

function spellAllowedForList(spellClasses: string[], listSlug: string): boolean {
  const want = listSlug.toLowerCase();
  return spellClasses.some((c) => c.toLowerCase() === want);
}

type SpellRowDb = { level: number; classes: string[] };

/**
 * Validates one segment: rows ordered as [all cantrips for this class][all leveled], matching the creation wizard payload.
 */
function validateStartingSpellBlock(
  rows: StartingSpellRow[],
  profile: CreationSpellProfileBE,
  bySlug: Record<string, SpellRowDb>,
): void {
  const expected = profile.cantrips + profile.leveledSpells;
  if (rows.length !== expected) {
    throw new ValidationError(
      `Starting spells: expected ${expected} spell(s) for this class (${profile.cantrips} cantrip(s), ${profile.leveledSpells} leveled), got ${rows.length}.`,
    );
  }

  let i = 0;
  for (let c = 0; c < profile.cantrips; c++) {
    const r = rows[i++]!;
    const sp = bySlug[r.spellSlug]!;
    if (sp.level !== 0) {
      throw new ValidationError(`Starting cantrip slot ${c + 1}: "${r.spellSlug}" is not a cantrip.`);
    }
    if (r.prepared || r.alwaysPrepared) {
      throw new ValidationError("Cantrips should not be marked prepared in startingSpells.");
    }
    if (!spellAllowedForList(sp.classes, profile.spellListSlug)) {
      throw new ValidationError(`Spell ${r.spellSlug} is not on the ${profile.spellListSlug} list.`);
    }
  }

  const leveledRows: StartingSpellRow[] = [];
  for (let l = 0; l < profile.leveledSpells; l++) {
    const r = rows[i++]!;
    const sp = bySlug[r.spellSlug]!;
    if (sp.level < 1) {
      throw new ValidationError(`Starting leveled spell slot ${l + 1}: "${r.spellSlug}" is not a leveled spell.`);
    }
    if (sp.level > profile.maxLeveledSpellLevel) {
      throw new ValidationError(
        `Spell ${r.spellSlug} is level ${sp.level}; at this level you can only pick up to ${profile.maxLeveledSpellLevel}.`,
      );
    }
    if (!spellAllowedForList(sp.classes, profile.spellListSlug)) {
      throw new ValidationError(`Spell ${r.spellSlug} is not on the ${profile.spellListSlug} list.`);
    }
    leveledRows.push(r);
  }

  if (profile.mode === "known") {
    const bad = leveledRows.filter((x) => x.prepared || x.alwaysPrepared);
    if (bad.length) {
      throw new ValidationError("Known casters: leveled spells must not be marked prepared in startingSpells.");
    }
  } else if (profile.mode === "prepared") {
    const bad = leveledRows.filter((x) => !x.prepared);
    if (bad.length) throw new ValidationError("Prepared casters: each leveled starting spell must have prepared: true.");
  } else if (profile.mode === "wizard") {
    const prepN = leveledRows.filter((x) => x.prepared).length;
    if (prepN !== profile.preparedFromLeveled) {
      throw new ValidationError(
        `Wizard: exactly ${profile.preparedFromLeveled} leveled spell(s) must be prepared; you have ${prepN}.`,
      );
    }
  }
}

/**
 * Multiclass: same order as frontend — for each class slice (sorted by sortOrder), cantrips then leveled spells.
 * Skips non-casting segments (no profile).
 */
function assertValidStartingSpellsMulticlass(
  slices: MulticlassSlice[],
  rows: StartingSpellRow[],
  bySlug: Record<string, SpellRowDb>,
  intelligence: number,
  wisdom: number,
  charisma: number,
): void {
  let idx = 0;
  for (const slice of slices) {
    const profile = getCreationSpellProfileBE(
      slice.classSlug,
      slice.subclassSlug,
      slice.levels,
      intelligence,
      wisdom,
      charisma,
    );
    if (!profile) continue;

    const n = profile.cantrips + profile.leveledSpells;
    const block = rows.slice(idx, idx + n);
    if (block.length !== n) {
      throw new ValidationError(
        `Multiclass: need ${n} starting spell(s) for ${slice.classSlug} (${slice.levels} level(s) in that class); payload is missing or incomplete.`,
      );
    }
    idx += n;
    validateStartingSpellBlock(block, profile, bySlug);
  }
  if (idx !== rows.length) {
    throw new ValidationError(
      `Multiclass: ${rows.length - idx} extra spell(s) in startingSpells — counts should match each casting class in segment order.`,
    );
  }
}

/**
 * Throws ValidationError if starting spells don't match PHB counts / preparation / levels.
 */
export async function assertValidStartingSpells(
  slices: MulticlassSlice[],
  intelligence: number,
  wisdom: number,
  charisma: number,
  rows: StartingSpellRow[],
): Promise<void> {
  if (!slices.length) return;

  if (rows.length > 0) {
    const slugs = rows.map((r) => r.spellSlug);
    const uniq = new Set(slugs);
    if (uniq.size !== slugs.length) throw new ValidationError("Duplicate spells in startingSpells.");

    const spells = await prisma.spell.findMany({ where: { slug: { in: slugs } } });
    const bySlug = Object.fromEntries(spells.map((s) => [s.slug, s])) as Record<string, SpellRowDb>;
    for (const slug of slugs) {
      if (!bySlug[slug]) throw new ValidationError(`Unknown spell: ${slug}`);
    }

    if (slices.length > 1) {
      assertValidStartingSpellsMulticlass(slices, rows, bySlug, intelligence, wisdom, charisma);
      return;
    }

    const first = slices[0]!;
    const profile = getCreationSpellProfileBE(
      first.classSlug,
      first.subclassSlug,
      first.levels,
      intelligence,
      wisdom,
      charisma,
    );
    if (!profile) {
      throw new ValidationError(
        "This class/level does not use starting spells here — clear startingSpells or pick a spellcasting class.",
      );
    }
    validateStartingSpellBlock(rows, profile, bySlug);
    return;
  }

  // rows.length === 0
  if (slices.length > 1) {
    return;
  }

  const first = slices[0]!;
  const profile = getCreationSpellProfileBE(
    first.classSlug,
    first.subclassSlug,
    first.levels,
    intelligence,
    wisdom,
    charisma,
  );
  if (profile) {
    throw new ValidationError("Your class needs starting spells — complete the Starting Spells step in character creation.");
  }
}

type CharSpellLite = { spellSlug: string; prepared: boolean; alwaysPrepared: boolean };
type SpellLite = { slug: string; level: number; classes: string[] };

/**
 * Returns an error message or null if the new spell can be added.
 */
export async function validateAddSpell(
  slices: MulticlassSlice[],
  intelligence: number,
  wisdom: number,
  charisma: number,
  existing: CharSpellLite[],
  newSpell: SpellLite,
): Promise<string | null> {
  if (slices.length > 1) return null;
  const first = slices[0];
  if (!first) return null;

  const profile = getCreationSpellProfileBE(
    first.classSlug,
    first.subclassSlug,
    first.levels,
    intelligence,
    wisdom,
    charisma,
  );
  if (!profile) return null;

  if (!spellAllowedForList(newSpell.classes, profile.spellListSlug)) {
    return `That spell is not on the ${profile.spellListSlug} spell list for your class.`;
  }

  const bySlug: Record<string, SpellLite> = { [newSpell.slug]: newSpell };
  const existingSpells = await prisma.spell.findMany({
    where: { slug: { in: existing.map((e) => e.spellSlug) } },
  });
  for (const s of existingSpells) {
    bySlug[s.slug] = s;
  }

  const sim = [...existing, { spellSlug: newSpell.slug, prepared: false, alwaysPrepared: false }];
  const cantripCount = sim.filter((r) => (bySlug[r.spellSlug]?.level ?? -1) === 0).length;
  const leveled = sim.filter((r) => (bySlug[r.spellSlug]?.level ?? 0) > 0);

  if (newSpell.level === 0) {
    if (cantripCount > profile.cantrips) {
      return `Cantrips: you can have at most ${profile.cantrips} (PHB/SRD for a level ${profile.classLevel} ${profile.classSlug}).`;
    }
  } else {
    if (newSpell.level > profile.maxLeveledSpellLevel) {
      return `That spell is too high level for your current spell slots (max ${profile.maxLeveledSpellLevel}).`;
    }
    if (leveled.length > profile.leveledSpells) {
      if (profile.mode === "wizard") {
        return `Spellbook: at most ${profile.leveledSpells} leveled spells in the book at wizard level ${profile.classLevel} (before extras like scrolls — ask your DM to override if copying spells).`;
      }
      if (profile.mode === "known") {
        return `Spells known: you can know at most ${profile.leveledSpells} leveled spells at this level.`;
      }
      return `You cannot add more leveled spells than ${profile.leveledSpells} (prepared/known limit for your class).`;
    }
  }

  return null;
}
