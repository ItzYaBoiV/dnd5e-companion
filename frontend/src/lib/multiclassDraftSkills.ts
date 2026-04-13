import { SKILL_NAMES, type CharacterDraft, type DndClass, type SkillName } from "@/types/dnd";

/** Default number of class skills to pick (PHB-style) when API data is wrong. */
const DEFAULT_SKILL_COUNT: Record<string, number> = {
  bard: 3,
  ranger: 3,
  rogue: 4,
  sorcerer: 2,
  warlock: 2,
  wizard: 2,
  barbarian: 2,
  cleric: 2,
  druid: 2,
  fighter: 2,
  monk: 2,
  paladin: 2,
};

function isSkillSlug(s: string): s is SkillName {
  return (SKILL_NAMES as readonly string[]).includes(s);
}

/** Bard/ranger/rogue list from any skills; others use filtered valid slugs only. */
function healClassSkills(cls: DndClass): { pool: string[]; count: number } {
  const rawPool = cls.skillChoices ?? [];
  const rawCount = cls.skillChoiceCount ?? 0;
  const valid = rawPool.filter((s) => isSkillSlug(s));
  const looksLikeInstruction = (s: string) =>
    /choose|any\s+three|any\s+two|from\s+among|following/i.test(s.replace(/-/g, " "));

  const garbageOnly =
    valid.length === 0 ||
    (rawPool.length > 0 && valid.length !== rawPool.length) ||
    rawPool.some((s) => looksLikeInstruction(s));

  if (garbageOnly) {
    const fullList = [...SKILL_NAMES];
    if (cls.slug === "bard" || cls.slug === "ranger" || cls.slug === "rogue") {
      return {
        pool: fullList,
        count: DEFAULT_SKILL_COUNT[cls.slug] ?? 3,
      };
    }
    if (valid.length >= 2) {
      return { pool: valid, count: Math.min(Math.max(rawCount, 1), valid.length) };
    }
    return {
      pool: fullList,
      count: DEFAULT_SKILL_COUNT[cls.slug] ?? 2,
    };
  }

  if (cls.slug === "bard" && rawCount === 1 && valid.length >= 3) {
    return { pool: valid, count: 3 };
  }

  return { pool: valid.length ? valid : rawPool, count: rawCount };
}

/** Skill pool and how many to pick when building single-class or multiclass. */
export function draftSkillConfig(draft: CharacterDraft, classes: DndClass[]) {
  if (!draft.useMulticlass || draft.classLevels.length === 0) {
    const cls = classes.find((c) => c.slug === draft.classSlug);
    if (!cls) return { pool: [], count: 0 };
    return healClassSkills(cls);
  }

  const seen = new Set<string>();
  const pool = new Set<string>();
  let count = 0;

  for (const row of draft.classLevels) {
    if (!row.classSlug || seen.has(row.classSlug)) continue;
    seen.add(row.classSlug);
    const cls = classes.find((c) => c.slug === row.classSlug);
    if (!cls) continue;
    const healed = healClassSkills(cls);
    count += healed.count;
    healed.pool.forEach((s) => pool.add(s));
  }

  return { pool: [...pool], count };
}

export function draftSavingThrows(draft: CharacterDraft, classes: DndClass[]): string[] {
  if (!draft.useMulticlass || draft.classLevels.length === 0) {
    const cls = classes.find((c) => c.slug === draft.classSlug);
    return cls?.savingThrows ?? [];
  }

  const seen = new Set<string>();
  const saves: string[] = [];
  for (const row of draft.classLevels) {
    if (!row.classSlug || seen.has(row.classSlug)) continue;
    seen.add(row.classSlug);
    const cls = classes.find((c) => c.slug === row.classSlug);
    if (cls?.savingThrows) saves.push(...cls.savingThrows);
  }
  return [...new Set(saves)];
}
