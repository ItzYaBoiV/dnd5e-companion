type ClassSlice = { classSlug: string; sortOrder: number };
type ClassRow = {
  weaponProficiencies: string[];
  armorProficiencies: string[];
  toolProficiencies: string[];
};

type ProficiencySet = {
  weapons: string[];
  armor: string[];
  tools: string[];
};

const ENTRY_BY_CLASS: Record<string, ProficiencySet> = {
  barbarian: {
    armor: ["light armor", "medium armor", "shields"],
    weapons: ["simple weapons", "martial weapons"],
    tools: [],
  },
  bard: {
    armor: ["light armor"],
    weapons: [],
    tools: ["musical instruments"],
  },
  cleric: {
    armor: ["light armor", "medium armor", "shields"],
    weapons: [],
    tools: [],
  },
  druid: {
    armor: ["light armor", "medium armor", "shields"],
    weapons: [],
    tools: [],
  },
  fighter: {
    armor: ["light armor", "medium armor", "shields"],
    weapons: ["simple weapons", "martial weapons"],
    tools: [],
  },
  monk: {
    armor: [],
    weapons: ["simple weapons", "shortsword"],
    tools: [],
  },
  paladin: {
    armor: ["light armor", "medium armor", "shields"],
    weapons: ["simple weapons", "martial weapons"],
    tools: [],
  },
  ranger: {
    armor: ["light armor", "medium armor", "shields"],
    weapons: ["simple weapons", "martial weapons"],
    tools: [],
  },
  rogue: {
    armor: ["light armor"],
    weapons: [],
    tools: ["thieves' tools"],
  },
  sorcerer: { armor: [], weapons: [], tools: [] },
  warlock: {
    armor: ["light armor"],
    weapons: ["simple weapons"],
    tools: [],
  },
  wizard: { armor: [], weapons: [], tools: [] },
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
 * - Additional class rows add only multiclass-entry armor/weapon/tool proficiencies.
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
      }
    }
    seen.add(slug);
  }

  return {
    weapons: uniq(weapons),
    armor: uniq(armor),
    tools: uniq(tools),
  };
}
