import type { AbilityScores } from "@/types/dnd";

type Row = { or?: boolean; reqs: { k: keyof AbilityScores; min: number }[] };

const TABLE: Record<string, Row> = {
  barbarian: { reqs: [{ k: "strength", min: 13 }] },
  bard: { reqs: [{ k: "charisma", min: 13 }] },
  cleric: { reqs: [{ k: "wisdom", min: 13 }] },
  druid: { reqs: [{ k: "wisdom", min: 13 }] },
  fighter: {
    or: true,
    reqs: [
      { k: "strength", min: 13 },
      { k: "dexterity", min: 13 },
    ],
  },
  monk: { reqs: [{ k: "dexterity", min: 13 }, { k: "wisdom", min: 13 }] },
  paladin: { reqs: [{ k: "strength", min: 13 }, { k: "charisma", min: 13 }] },
  ranger: { reqs: [{ k: "dexterity", min: 13 }, { k: "wisdom", min: 13 }] },
  rogue: { reqs: [{ k: "dexterity", min: 13 }] },
  sorcerer: { reqs: [{ k: "charisma", min: 13 }] },
  warlock: { reqs: [{ k: "charisma", min: 13 }] },
  wizard: { reqs: [{ k: "intelligence", min: 13 }] },
};

export function meetsMulticlassPrerequisite(classSlug: string, scores: AbilityScores): boolean {
  const row = TABLE[classSlug];
  if (!row) return true;
  if (row.or) {
    return row.reqs.some((r) => scores[r.k] >= r.min);
  }
  return row.reqs.every((r) => scores[r.k] >= r.min);
}

export function multiclassPrereqHint(classSlug: string): string {
  const row = TABLE[classSlug];
  if (!row) return "";
  const ab = (k: keyof AbilityScores) =>
    k === "strength"
      ? "STR"
      : k === "dexterity"
        ? "DEX"
        : k === "constitution"
          ? "CON"
          : k === "intelligence"
            ? "INT"
            : k === "wisdom"
              ? "WIS"
              : "CHA";
  if (row.or) {
    return row.reqs.map((r) => `${ab(r.k)} ${r.min}`).join(" or ");
  }
  return row.reqs.map((r) => `${ab(r.k)} ${r.min}`).join(" and ");
}
