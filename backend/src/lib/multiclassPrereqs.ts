/** PHB p.164 multiclass prerequisites (validated on base scores from character create input). */
export type AbilityKey =
  | "strength"
  | "dexterity"
  | "constitution"
  | "intelligence"
  | "wisdom"
  | "charisma";

export type MulticlassPrereq = { ability: AbilityKey; min: number };

export const MULTICLASS_PREREQUISITES: Record<
  string,
  { or?: boolean; reqs: MulticlassPrereq[] }
> = {
  barbarian: { reqs: [{ ability: "strength", min: 13 }] },
  bard: { reqs: [{ ability: "charisma", min: 13 }] },
  cleric: { reqs: [{ ability: "wisdom", min: 13 }] },
  druid: { reqs: [{ ability: "wisdom", min: 13 }] },
  fighter: {
    or: true,
    reqs: [
      { ability: "strength", min: 13 },
      { ability: "dexterity", min: 13 },
    ],
  },
  monk: { reqs: [{ ability: "dexterity", min: 13 }, { ability: "wisdom", min: 13 }] },
  paladin: { reqs: [{ ability: "strength", min: 13 }, { ability: "charisma", min: 13 }] },
  ranger: { reqs: [{ ability: "dexterity", min: 13 }, { ability: "wisdom", min: 13 }] },
  rogue: { reqs: [{ ability: "dexterity", min: 13 }] },
  sorcerer: { reqs: [{ ability: "charisma", min: 13 }] },
  warlock: { reqs: [{ ability: "charisma", min: 13 }] },
  wizard: { reqs: [{ ability: "intelligence", min: 13 }] },
};

export function meetsMulticlassPrerequisite(
  classSlug: string,
  scores: Record<AbilityKey, number>,
): boolean {
  const row = MULTICLASS_PREREQUISITES[classSlug];
  if (!row) return true;
  if (row.or) {
    return row.reqs.some((r) => (scores[r.ability] ?? 0) >= r.min);
  }
  return row.reqs.every((r) => (scores[r.ability] ?? 0) >= r.min);
}

export function multiclassPrerequisiteDescription(classSlug: string): string {
  const row = MULTICLASS_PREREQUISITES[classSlug];
  if (!row) return "";
  const abbr = (a: AbilityKey) =>
    a === "strength"
      ? "STR"
      : a === "dexterity"
        ? "DEX"
        : a === "constitution"
          ? "CON"
          : a === "intelligence"
            ? "INT"
            : a === "wisdom"
              ? "WIS"
              : "CHA";
  if (row.or) {
    return row.reqs.map((r) => `${abbr(r.ability)} ${r.min}`).join(" or ");
  }
  return row.reqs.map((r) => `${abbr(r.ability)} ${r.min}`).join(" and ");
}
