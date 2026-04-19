import { SKILL_NAMES, type CharacterDraft, type DndClass, type SkillName } from "@/types/dnd";

/** PHB p.164 multiclass entry: one skill from that class's list (not the full 18-skill pool). */
const MULTICLASS_ENTRY_SKILL_POOLS: Partial<Record<string, string[]>> = {
  ranger: [
    "animal-handling",
    "athletics",
    "insight",
    "investigation",
    "nature",
    "perception",
    "stealth",
    "survival",
  ],
  rogue: [
    "acrobatics",
    "athletics",
    "deception",
    "insight",
    "intimidation",
    "investigation",
    "perception",
    "performance",
    "persuasion",
    "sleight-of-hand",
    "stealth",
  ],
};

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
    const slug = row.classSlug?.trim();
    if (!slug || seen.has(slug)) continue;
    const isFirstDistinct = seen.size === 0;
    seen.add(slug);
    const cls = classes.find((c) => c.slug === slug);
    if (!cls) continue;
    const healed = healClassSkills(cls);
    if (isFirstDistinct) {
      count += healed.count;
      healed.pool.forEach((s) => pool.add(s));
    } else if (cls.slug === "bard" || cls.slug === "ranger" || cls.slug === "rogue") {
      count += 1;
      const restrictedPool = MULTICLASS_ENTRY_SKILL_POOLS[cls.slug];
      if (restrictedPool) {
        restrictedPool.forEach((s) => pool.add(s));
      } else {
        healed.pool.forEach((s) => pool.add(s));
      }
    }
  }

  return { pool: [...pool], count };
}

export function draftSavingThrows(draft: CharacterDraft, classes: DndClass[]): string[] {
  if (!draft.useMulticlass || draft.classLevels.length === 0) {
    const cls = classes.find((c) => c.slug === draft.classSlug);
    return cls?.savingThrows ?? [];
  }

  const firstSlug =
    draft.multiclassFirstClassSlug?.trim() ||
    draft.classLevels.find((r) => r.classSlug.trim() && r.levels >= 1)?.classSlug.trim() ||
    draft.classLevels[0]?.classSlug.trim() ||
    "";
  const cls = classes.find((c) => c.slug === firstSlug);
  return cls?.savingThrows ?? [];
}
