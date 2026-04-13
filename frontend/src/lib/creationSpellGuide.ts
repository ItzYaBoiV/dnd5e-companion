/**
 * SRD / PHB-style spell counts for character creation (single-class and per-class multiclass segments).
 * Guides the Starting Spells step and matches backend validation.
 */

import type { CharacterDraft, Race } from "@/types/dnd";
import { scoresAfterRace } from "@/lib/suggestedAbilityScores";

const BARD_SPELLS_KNOWN = [
  4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22,
];
/** PHB Sorcerer "Spells Known" column (leveled spells only, not cantrips). */
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

/** Wizard / cleric-style cantrip curve (SRD). */
export function cantripsWizardCleric(level: number): number {
  const L = Math.max(1, Math.min(20, level));
  if (L <= 3) return 3;
  if (L <= 9) return 4;
  return 5;
}

/** Druid cantrips (PHB). */
export function cantripsDruid(level: number): number {
  const L = Math.max(1, Math.min(20, level));
  if (L <= 3) return 2;
  if (L <= 9) return 3;
  return 4;
}

/** Bard & warlock cantrips (PHB). */
export function cantripsBardWarlock(level: number): number {
  const L = Math.max(1, Math.min(20, level));
  if (L <= 3) return 2;
  if (L <= 9) return 3;
  return 4;
}

/** Sorcerer cantrips (PHB). */
export function cantripsSorcerer(level: number): number {
  const L = Math.max(1, Math.min(20, level));
  if (L <= 3) return 4;
  if (L <= 10) return 5;
  return 6;
}

/** EK / AT cantrips by character level in that class (PHB). */
export function cantripsThirdCaster(level: number): number {
  const L = Math.max(1, Math.min(20, level));
  if (L < 3) return 0;
  if (L <= 6) return 2;
  if (L <= 12) return 3;
  if (L <= 18) return 4;
  return 5;
}

/** Max spell level from slot row (full / half / warlock / third). */
export function maxSlotSpellLevel(
  classSlug: string,
  subclassSlug: string | undefined | null,
  classLevel: number,
): number {
  const L = Math.max(1, Math.min(20, classLevel));
  const sub = (subclassSlug ?? "").toLowerCase();

  if (classSlug === "warlock") {
    const pact = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    return pact[L - 1] ?? 1;
  }

  if (classSlug === "fighter" && sub.includes("eldritch")) {
    const casterLv = Math.max(0, Math.floor(L / 3));
    if (casterLv <= 0) return 0;
    return Math.min(4, Math.ceil(casterLv / 2));
  }
  if (classSlug === "rogue" && sub.includes("arcane")) {
    const casterLv = Math.max(0, Math.floor(L / 3));
    if (casterLv <= 0) return 0;
    return Math.min(4, Math.ceil(casterLv / 2));
  }

  const half = ["paladin", "ranger"];
  if (half.includes(classSlug)) {
    const casterLv = Math.floor(L / 2);
    if (casterLv <= 0) return 0;
    return Math.min(5, Math.ceil(casterLv / 2));
  }

  return Math.min(9, Math.max(1, Math.ceil(L / 2)));
}

export type CreationSpellMode =
  | "skip"
  | "known" // leveled spells known; prepared false
  | "wizard" // spellbook + subset prepared
  | "prepared"; // pick spells; all prepared (cleric, druid, paladin)

export type CreationSpellProfile = {
  mode: CreationSpellMode;
  /** Character class (fighter, wizard, …). */
  classSlug: string;
  /** Which class spell list to load from the API (wizard for EK/AT). */
  spellListSlug: string;
  classLevel: number;
  /** Cantrips you must pick (exactly this many). */
  cantrips: number;
  /** Non-cantrip spells to pick (exactly this many), each ≤ maxLeveledSpellLevel. */
  leveledSpells: number;
  maxLeveledSpellLevel: number;
  /** Wizard: how many of leveled must be marked prepared. Cleric/druid/paladin: same as leveledSpells. */
  preparedFromLeveled: number;
  kidSummary: string;
  ruleBlurb: string;
};

function isEldritchKnight(classSlug: string, sub: string): boolean {
  return classSlug === "fighter" && sub.includes("eldritch");
}

function isArcaneTrickster(classSlug: string, sub: string): boolean {
  return classSlug === "rogue" && sub.includes("arcane");
}

/**
 * Single-class spell creation profile, or null if this step should be skipped (multiclass / no spells yet).
 */
export function getCreationSpellProfile(draft: CharacterDraft, race: Race | undefined): CreationSpellProfile | null {
  if (draft.useMulticlass) return null;

  const slug = draft.classSlug;
  const L = Math.max(1, Math.min(20, draft.level));
  const sub = (draft.subclassSlug ?? "").toLowerCase();
  const finalScores = scoresAfterRace(draft.scores, race, draft.subraceSlug);
  const intM = mod(finalScores.intelligence);
  const wisM = mod(finalScores.wisdom);
  const chaM = mod(finalScores.charisma);

  const maxLv = maxSlotSpellLevel(slug, draft.subclassSlug, L);

  if (slug === "wizard") {
    const cantrips = cantripsWizardCleric(L);
    const book = 6 + 2 * (L - 1);
    const prep = Math.max(1, intM + L);
    return {
      mode: "wizard",
      classSlug: slug,
      spellListSlug: "wizard",
      classLevel: L,
      cantrips,
      leveledSpells: book,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: Math.min(book, prep),
      kidSummary: `Pick ${cantrips} cantrips, add ${book} spells to your spellbook (each no higher than level ${maxLv} — what you can cast), then mark ${Math.min(book, prep)} of them as prepared for today.`,
      ruleBlurb:
        "SRD/PHB: Wizards start with 6 first-level spells in the book at 1st level and add 2 wizard spells per wizard level. You prepare a number equal to your Intelligence modifier + your wizard level (minimum 1).",
    };
  }

  if (slug === "cleric") {
    const cantrips = cantripsWizardCleric(L);
    const prep = Math.max(1, wisM + L);
    return {
      mode: "prepared",
      classSlug: slug,
      spellListSlug: "cleric",
      classLevel: L,
      cantrips,
      leveledSpells: prep,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: prep,
      kidSummary: `Pick ${cantrips} cantrips, then pick ${prep} spells to prepare (you can cast these today).`,
      ruleBlurb:
        "Cleric: You know cleric spells of levels you can cast; at creation we record your prepared list. Prepared spells = Wisdom modifier + cleric level (minimum 1).",
    };
  }

  if (slug === "druid") {
    const cantrips = cantripsDruid(L);
    const prep = Math.max(1, wisM + L);
    return {
      mode: "prepared",
      classSlug: slug,
      spellListSlug: "druid",
      classLevel: L,
      cantrips,
      leveledSpells: prep,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: prep,
      kidSummary: `Pick ${cantrips} cantrips, then pick ${prep} spells to prepare.`,
      ruleBlurb: "Druid: Prepared spells = Wisdom modifier + druid level (minimum 1).",
    };
  }

  if (slug === "bard") {
    const c = cantripsBardWarlock(L);
    const known = BARD_SPELLS_KNOWN[L - 1] ?? 0;
    return {
      mode: "known",
      classSlug: slug,
      spellListSlug: "bard",
      classLevel: L,
      cantrips: c,
      leveledSpells: known,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: 0,
      kidSummary: `Pick ${c} cantrips and ${known} other spells you know (shown on your sheet).`,
      ruleBlurb: "Bard: Spells known follow the bard table (SRD); cantrips use the bard/warlock progression.",
    };
  }

  if (slug === "sorcerer") {
    const c = cantripsSorcerer(L);
    const known = SORCERER_LEVELED_SPELLS_KNOWN[L - 1] ?? 0;
    return {
      mode: "known",
      classSlug: slug,
      spellListSlug: "sorcerer",
      classLevel: L,
      cantrips: c,
      leveledSpells: known,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: 0,
      kidSummary: `Pick ${c} cantrips and ${known} spells you know.`,
      ruleBlurb: "Sorcerer: Uses spells known + sorcerer cantrip counts (PHB/SRD).",
    };
  }

  if (slug === "warlock") {
    const c = cantripsBardWarlock(L);
    const known = WARLOCK_SPELLS_KNOWN[L - 1] ?? 0;
    return {
      mode: "known",
      classSlug: slug,
      spellListSlug: "warlock",
      classLevel: L,
      cantrips: c,
      leveledSpells: known,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: 0,
      kidSummary: `Pick ${c} cantrips and ${known} spells known (pact magic).`,
      ruleBlurb: "Warlock: Cantrips and spells known follow the warlock table.",
    };
  }

  if (slug === "ranger" && L >= 2) {
    const known = RANGER_SPELLS_KNOWN[L - 1] ?? 0;
    return {
      mode: "known",
      classSlug: slug,
      spellListSlug: "ranger",
      classLevel: L,
      cantrips: 0,
      leveledSpells: known,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: 0,
      kidSummary: `Pick ${known} ranger spells you know (no cantrips at this level on the PHB table).`,
      ruleBlurb: "Ranger: Spells known from the ranger table (starts at 2nd level).",
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
      kidSummary: `Pick ${prep} paladin spells to prepare (Charisma mod + half paladin level, minimum 1).`,
      ruleBlurb: "Paladin: Prepares spells like a half caster (PHB).",
    };
  }

  if (isEldritchKnight(slug, sub) && L >= 3) {
    const c = cantripsThirdCaster(L);
    const known = THIRD_CASTER_SPELLS_KNOWN[L - 1] ?? 0;
    return {
      mode: "known",
      classSlug: slug,
      spellListSlug: "wizard",
      classLevel: L,
      cantrips: c,
      leveledSpells: known,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: 0,
      kidSummary: `Eldritch Knight: pick ${c} cantrips and ${known} wizard spells you know.`,
      ruleBlurb: "Eldritch Knight uses the Eldritch Knight / third-caster progression.",
    };
  }

  if (isArcaneTrickster(slug, sub) && L >= 3) {
    const c = cantripsThirdCaster(L);
    const known = THIRD_CASTER_SPELLS_KNOWN[L - 1] ?? 0;
    return {
      mode: "known",
      classSlug: slug,
      spellListSlug: "wizard",
      classLevel: L,
      cantrips: c,
      leveledSpells: known,
      maxLeveledSpellLevel: maxLv,
      preparedFromLeveled: 0,
      kidSummary: `Arcane Trickster: pick ${c} cantrips and ${known} wizard spells you know.`,
      ruleBlurb: "Arcane Trickster uses the third-caster progression.",
    };
  }

  return null;
}

/** One spellcasting segment for multiclass (per class + levels in that class). */
export type MulticlassCreationSpellSegment = {
  segmentKey: string;
  displayLabel: string;
  profile: CreationSpellProfile;
};

/**
 * For each class row with spellcasting, return a profile as if that class were single-classed at `row.levels`.
 * Used by the Starting Spells step when `useMulticlass` is true.
 */
/**
 * Multiclass stepped creation at level 1: only the class taken at 1st level may have spell picks (as level 1 in that class).
 */
export function getMulticlassInitialSpellSegments(
  draft: CharacterDraft,
  race: Race | undefined,
): MulticlassCreationSpellSegment[] {
  if (!draft.useMulticlass || !draft.classLevels.length) return [];
  const first = (draft.multiclassFirstClassSlug ?? "").trim();
  if (!first) return [];
  const out: MulticlassCreationSpellSegment[] = [];
  draft.classLevels.forEach((row, idx) => {
    const slug = String(row.classSlug ?? "").trim();
    if (slug !== first) return;
    const fakeDraft: CharacterDraft = {
      ...draft,
      useMulticlass: false,
      classSlug: slug,
      subclassSlug: row.subclassSlug ?? "",
      level: 1,
    };
    const profile = getCreationSpellProfile(fakeDraft, race);
    if (!profile) return;
    const segmentKey = `${idx}-${slug}`;
    const displayLabel = `${slug.replace(/-/g, " ")} (1st character level)`;
    out.push({ segmentKey, displayLabel, profile });
  });
  return out;
}

export function getMulticlassCreationSpellProfiles(
  draft: CharacterDraft,
  race: Race | undefined,
): MulticlassCreationSpellSegment[] {
  if (!draft.useMulticlass || !draft.classLevels.length) return [];
  const out: MulticlassCreationSpellSegment[] = [];
  draft.classLevels.forEach((row, idx) => {
    const L = row.levels;
    const slug = String(row.classSlug ?? "").trim();
    if (L < 1 || !slug) return;
    const fakeDraft: CharacterDraft = {
      ...draft,
      useMulticlass: false,
      classSlug: slug,
      subclassSlug: row.subclassSlug ?? "",
      level: L,
    };
    const profile = getCreationSpellProfile(fakeDraft, race);
    if (!profile) return;
    const segmentKey = `${idx}-${slug}`;
    const displayLabel = `${slug.replace(/-/g, " ")} (level ${L} in this class)`;
    out.push({ segmentKey, displayLabel, profile });
  });
  return out;
}

export type StartingSpellPick = { spellSlug: string; prepared: boolean };

/** True if picks satisfy the profile (spell levels checked separately against DB). */
export function validateStartingSpellPicks(
  profile: CreationSpellProfile,
  cantripSlugs: string[],
  leveled: StartingSpellPick[],
): { ok: true } | { ok: false; message: string } {
  const cSet = new Set(cantripSlugs);
  if (cSet.size !== cantripSlugs.length) return { ok: false, message: "Duplicate cantrips." };
  if (cantripSlugs.length !== profile.cantrips) {
    return {
      ok: false,
      message: `Pick exactly ${profile.cantrips} cantrip(s). You have ${cantripSlugs.length}.`,
    };
  }

  const levSlugs = leveled.map((x) => x.spellSlug);
  if (new Set(levSlugs).size !== levSlugs.length) {
    return { ok: false, message: "Duplicate leveled spells." };
  }
  if (levSlugs.length !== profile.leveledSpells) {
    return {
      ok: false,
      message: `Pick exactly ${profile.leveledSpells} leveled spell(s). You have ${levSlugs.length}.`,
    };
  }

  const overlap = cantripSlugs.filter((s) => levSlugs.includes(s));
  if (overlap.length) return { ok: false, message: "A spell cannot be both a cantrip and a leveled pick." };

  if (profile.mode === "known") {
    const bad = leveled.filter((x) => x.prepared);
    if (bad.length) return { ok: false, message: "Known casters do not prepare spells this way — all picks should be unprepared (known)." };
  }

  if (profile.mode === "prepared") {
    const notPrep = leveled.filter((x) => !x.prepared);
    if (notPrep.length) return { ok: false, message: "Choose your prepared spells — each leveled pick should be marked prepared." };
  }

  if (profile.mode === "wizard") {
    const prepCount = leveled.filter((x) => x.prepared).length;
    if (prepCount !== profile.preparedFromLeveled) {
      return {
        ok: false,
        message: `Mark exactly ${profile.preparedFromLeveled} spell(s) in your book as prepared (you have ${prepCount}).`,
      };
    }
  }

  return { ok: true };
}

/** Build API payload rows from UI state. */
export function startingSpellsToPayload(
  profile: CreationSpellProfile,
  cantripSlugs: string[],
  leveled: StartingSpellPick[],
): { spellSlug: string; prepared: boolean; alwaysPrepared: boolean }[] {
  const rows: { spellSlug: string; prepared: boolean; alwaysPrepared: boolean }[] = [];
  for (const s of cantripSlugs) {
    rows.push({ spellSlug: s, prepared: false, alwaysPrepared: false });
  }
  for (const x of leveled) {
    rows.push({
      spellSlug: x.spellSlug,
      prepared: profile.mode === "wizard" ? x.prepared : profile.mode === "prepared" ? true : false,
      alwaysPrepared: false,
    });
  }
  return rows;
}
