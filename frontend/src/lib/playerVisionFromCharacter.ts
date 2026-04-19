import type { Character } from "@/types/dnd";

/** 5e default: dim light / torch-style exploration when no darkvision (cells). */
const DEFAULT_DIM_VISION_CELLS = 6;

/** SRD-ish darkvision by race/subrace slug (feet → cells at 5ft/cell). */
const RACE_DARKVISION_FT: Record<string, number> = {
  elf: 60,
  high_elf: 60,
  wood_elf: 60,
  eladrin: 60,
  sea_elf: 60,
  drow: 120,
  dwarf: 60,
  hill_dwarf: 60,
  mountain_dwarf: 60,
  duergar: 120,
  gnome: 60,
  forest_gnome: 60,
  rock_gnome: 60,
  deep_gnome: 120,
  halfling: 0,
  lightfoot_halfling: 0,
  stout_halfling: 0,
  ghostwise_halfling: 0,
  half_elf: 60,
  half_orc: 60,
  tiefling: 60,
  human: 0,
  variant_human: 0,
  dragonborn: 0,
  aarakocra: 0,
  genasi: 0,
  goliath: 0,
  kenku: 0,
  lizardfolk: 0,
  tabaxi: 60,
  tortle: 0,
  triton: 60,
  bugbear: 60,
  firbolg: 60,
  goblin: 60,
  hobgoblin: 60,
  kobold: 60,
  orc: 60,
  yuan_ti_pureblood: 60,
};

function feetToCells(ft: number): number {
  return Math.max(2, Math.min(30, Math.round(ft / 5)));
}

/**
 * Grid radius (Chebyshev cells) for fog + sight ring from character race/features.
 * Falls back to dim-light radius when no darkvision.
 */
export function visionRadiusCellsFromCharacter(ch: Character | null | undefined): number {
  if (!ch) return DEFAULT_DIM_VISION_CELLS;

  const norm = (s: string) => s.trim().toLowerCase().replace(/-/g, "_");

  let maxFt = 0;
  const sub = norm(ch.subraceSlug ?? "");
  const race = norm(ch.raceSlug ?? "");
  if (sub && RACE_DARKVISION_FT[sub] != null) maxFt = Math.max(maxFt, RACE_DARKVISION_FT[sub]!);
  if (race && RACE_DARKVISION_FT[race] != null) maxFt = Math.max(maxFt, RACE_DARKVISION_FT[race]!);

  for (const f of ch.features ?? []) {
    const name = (f.name ?? "").toLowerCase();
    const desc = (f.description ?? "").toLowerCase();
    if (!name.includes("darkvision") && !desc.includes("darkvision")) continue;
    const text = `${f.name} ${f.description}`;
    const m = /(\d+)\s*ft/i.exec(text);
    if (m) maxFt = Math.max(maxFt, Number(m[1]));
    else if (name.includes("darkvision") || desc.includes("darkvision")) maxFt = Math.max(maxFt, 60);
  }

  if (maxFt > 0) return feetToCells(maxFt);
  return DEFAULT_DIM_VISION_CELLS;
}
