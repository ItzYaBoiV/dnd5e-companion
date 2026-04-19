import type { Item } from "@/types/dnd";

export type LootDepthOpts = {
  /** 0–1, higher = deeper in dungeon (better treasure bias). */
  dungeonDepth?: number;
};

/** Pick a loot row for procedural maps using SRD reference items + party tier. */
export function pickReferenceLootItem(
  rng: () => number,
  items: Item[] | null | undefined,
  partyLevel: number,
  depthOpts?: LootDepthOpts | null,
): { slug: string; name: string } | null {
  if (!items?.length) return null;
  const lv = Math.max(1, Math.min(20, partyLevel));
  const d = Math.max(0, Math.min(1, depthOpts?.dungeonDepth ?? 0.5));
  const allowMagical = lv >= 3 && d >= 0.2;
  const allowAttunement = lv >= 8 && d >= 0.55;
  const preferRare = d >= 0.5;
  const preferVr = d >= 0.75;

  let pool = items.filter((it) => {
    const cat = String(it.category || "").toLowerCase();
    if (cat === "vehicle" || cat === "mount") return lv >= 10 && d >= 0.6;
    if (!allowMagical && it.magical) {
      return /\b(potion|scroll|elixir|oil|ammunition|arrow|bolt)\b/i.test(it.name);
    }
    if (!allowAttunement && it.requiresAttunement) return false;
    const r = String((it as Item & { rarity?: string }).rarity || "common").toLowerCase();
    if (!preferVr && (r === "very rare" || r === "legendary")) return false;
    if (!preferRare && (r === "rare" || r === "very rare")) return rng() < 0.35;
    return true;
  });

  if (pool.length < 4) {
    pool = items.filter((it) => {
      const cat = String(it.category || "").toLowerCase();
      return cat !== "vehicle" && cat !== "mount";
    });
  }
  if (!pool.length) return null;

  // Bias occasionally toward real weapon rows from the DB (not a generic “+1 weapon” label).
  const weaponBias = rng() < 0.32;
  if (weaponBias) {
    const weapons = pool.filter((it) => String(it.category).toLowerCase() === "weapon");
    if (weapons.length >= 2) pool = weapons;
  }

  return pool[Math.floor(rng() * pool.length)]!;
}
