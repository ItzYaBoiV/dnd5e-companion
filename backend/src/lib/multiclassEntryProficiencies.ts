type ClassSlice = { classSlug: string; sortOrder: number };
type ClassRow = {
  weaponProficiencies: string[];
  armorProficiencies: string[];
  toolProficiencies: string[];
};

export type ProficiencySet = {
  weapons: string[];
  armor: string[];
  tools: string[];
  /** PHB p.164 multiclass-entry skill grants (descriptive; actual picks live in skillProficiencies). */
  skills: string[];
};

const ENTRY_BY_CLASS: Record<string, ProficiencySet> = {
  barbarian: {
    armor: ["shields"],
    weapons: ["simple weapons", "martial weapons"],
    tools: [],
    skills: [],
  },
  bard: {
    armor: ["light armor"],
    weapons: [],
    tools: ["musical instruments"],
    skills: ["one skill of your choice"],
  },
  cleric: {
    armor: ["light armor", "medium armor", "shields"],
    weapons: [],
    tools: [],
    skills: [],
  },
  druid: {
    armor: ["light armor", "medium armor", "shields"],
    weapons: [],
    tools: [],
    skills: [],
  },
  fighter: {
    armor: ["light armor", "medium armor", "heavy armor", "shields"],
    weapons: ["simple weapons", "martial weapons"],
    tools: [],
    skills: [],
  },
  monk: {
    armor: [],
    weapons: ["simple weapons", "shortsword"],
    tools: [],
    skills: [],
  },
  paladin: {
    armor: ["light armor", "medium armor", "shields"],
    weapons: ["simple weapons", "martial weapons"],
    tools: [],
    skills: [],
  },
  ranger: {
    armor: ["light armor", "medium armor", "shields"],
    weapons: ["simple weapons", "martial weapons"],
    tools: [],
    skills: [],
  },
  rogue: {
    armor: ["light armor"],
    weapons: [],
    tools: ["thieves' tools"],
    skills: ["one skill from the Rogue skill list"],
  },
  sorcerer: { armor: [], weapons: [], tools: [], skills: [] },
  warlock: {
    armor: ["light armor"],
    weapons: ["simple weapons"],
    tools: [],
    skills: [],
  },
  wizard: { armor: [], weapons: [], tools: [], skills: [] },
};

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * PHB p.164 multiclass proficiencies:
 * - First class row keeps full class proficiencies (seeded Open5e strings).
 * - Additional class rows add only multiclass-entry armor/weapon/tool/skill proficiencies.
 */
export function computeCreateProficienciesFromClasses(
  slices: ClassSlice[],
  classBySlug: Record<string, ClassRow>,
): ProficiencySet {
  const ordered = [...slices].sort((a, b) => a.sortOrder - b.sortOrder);
  const seen = new Set<string>();
  const weapons: string[] = [];
  const armor: string[] = [];
  const tools: string[] = [];
  const skills: string[] = [];

  for (const row of ordered) {
    const slug = row.classSlug?.trim();
    if (!slug || seen.has(slug)) continue;
    const c = classBySlug[slug];
    if (!c) continue;

    if (seen.size === 0) {
      weapons.push(...(c.weaponProficiencies ?? []));
      armor.push(...(c.armorProficiencies ?? []));
      tools.push(...(c.toolProficiencies ?? []));
    } else {
      const entry = ENTRY_BY_CLASS[slug];
      if (entry) {
        weapons.push(...entry.weapons);
        armor.push(...entry.armor);
        tools.push(...entry.tools);
        skills.push(...entry.skills);
      }
    }
    seen.add(slug);
  }

  return {
    weapons: uniq(weapons),
    armor: uniq(armor),
    tools: uniq(tools),
    skills: uniq(skills),
  };
}
