import type { Item } from "@/types/dnd";

/** Pick a loot row for procedural maps using SRD reference items + party tier. */
export function pickReferenceLootItem(
  rng: () => number,
  items: Item[] | null | undefined,
  partyLevel: number,
): { slug: string; name: string } | null {
  if (!items?.length) return null;
  const lv = Math.max(1, Math.min(20, partyLevel));
  const allowMagical = lv >= 3;
  const allowAttunement = lv >= 8;

  let pool = items.filter((it) => {
    const cat = String(it.category || "").toLowerCase();
    if (cat === "vehicle" || cat === "mount") return lv >= 10;
    if (!allowMagical && it.magical) {
      return /\b(potion|scroll|elixir|oil|ammunition|arrow|bolt)\b/i.test(it.name);
    }
    if (!allowAttunement && it.requiresAttunement) return false;
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
