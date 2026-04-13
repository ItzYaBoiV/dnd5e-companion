/**
 * Derive armor class and weapon attack summaries from equipped inventory + Item rows.
 */

import type { InventoryItem, Item as DbItem } from "@prisma/client";
import {
  type AbilityModifiers,
  type ArmorData,
  type AttackData,
  armorClass,
  weaponAttack,
} from "./calculationService";

export interface WeaponAttackSummary {
  inventoryItemId: string;
  name: string;
  attackBonus: number;
  damageDice: string;
  damageBonus: number;
  damageFormula: string;
  damageType: string;
  abilityUsed: string;
  isProficient: boolean;
  rangeLabel: string;
  notes: string;
}

function itemCategory(item: DbItem): string {
  return (item.category || "").trim().toLowerCase();
}

function isShieldItem(item: DbItem): boolean {
  const s = item.slug.toLowerCase();
  const n = item.name.toLowerCase();
  return s.includes("shield") || n === "shield" || n.endsWith(" shield");
}

function isBodyArmor(item: DbItem): boolean {
  if (isShieldItem(item)) return false;
  if (item.armorClass == null) return false;
  const c = itemCategory(item);
  if (c === "weapon") return false;
  return c === "armor" || c === "magic";
}

function armorCategoryFromItem(item: DbItem): ArmorData["category"] {
  const sub = (item.subcategory || "").toLowerCase();
  if (sub.includes("heavy")) return "heavy";
  if (sub.includes("medium")) return "medium";
  if (sub.includes("light")) return "light";
  const ac = item.armorClass ?? 10;
  if (ac >= 16) return "heavy";
  if (ac >= 13) return "medium";
  return "light";
}

function armorRank(item: DbItem): number {
  const sub = (item.subcategory || "").toLowerCase();
  if (sub.includes("heavy")) return 3;
  if (sub.includes("medium")) return 2;
  if (sub.includes("light")) return 1;
  const ac = item.armorClass ?? 0;
  if (ac >= 16) return 3;
  if (ac >= 14) return 2;
  return 1;
}

/** Pick one body armor and whether a shield is equipped (5e: one armor + shield). */
export function resolveEquippedArmor(
  inventory: InventoryItem[],
  itemBySlug: Record<string, DbItem>,
): {
  body: DbItem | null;
  shield: boolean;
  stealthDisadvantage: boolean;
  armorLabel: string | null;
} {
  const equipped = inventory.filter((i) => i.equipped && i.itemSlug);
  let body: DbItem | null = null;
  let shield = false;
  let stealthDis = false;
  let armorLabel: string | null = null;

  for (const inv of equipped) {
    const slug = inv.itemSlug!;
    const it = itemBySlug[slug];
    if (!it) continue;
    if (isShieldItem(it)) {
      shield = true;
      continue;
    }
    if (isBodyArmor(it)) {
      if (!body || armorRank(it) > armorRank(body) || (armorRank(it) === armorRank(body) && (it.armorClass ?? 0) > (body.armorClass ?? 0))) {
        body = it;
      }
    }
  }

  if (body) {
    armorLabel = body.name;
    stealthDis = body.stealthDis;
  }

  return { body, shield, stealthDisadvantage: stealthDis, armorLabel };
}

export function buildArmorData(body: DbItem | null, hasShield: boolean): ArmorData | null {
  if (!body) {
    if (hasShield) {
      return { category: "none", baseAc: 10, hasShield: true, stealthDisadvantage: false, strengthRequirement: null };
    }
    return null;
  }
  return {
    category: armorCategoryFromItem(body),
    baseAc: body.armorClass ?? 10,
    hasShield,
    stealthDisadvantage: body.stealthDis,
    strengthRequirement: body.strengthReq,
  };
}

function formatDamageFormula(dice: string, bonus: number): string {
  if (bonus === 0) return dice;
  if (bonus > 0) return `${dice}+${bonus}`;
  return `${dice}${bonus}`;
}

export function computeEquippedWeaponSummaries(
  inventory: InventoryItem[],
  itemBySlug: Record<string, DbItem>,
  modifiers: AbilityModifiers,
  profBonus: number,
  weaponProficiencies: string[],
): WeaponAttackSummary[] {
  const out: WeaponAttackSummary[] = [];
  for (const inv of inventory) {
    if (!inv.equipped || !inv.itemSlug) continue;
    const it = itemBySlug[inv.itemSlug];
    if (!it || itemCategory(it) !== "weapon" || !it.damageDice) continue;

    const attackData: AttackData = {
      weaponSlug: it.slug,
      weaponName: it.name,
      subcategory: it.subcategory,
      damageDice: it.damageDice,
      damageType: it.damageType || "bludgeoning",
      properties: it.properties ?? [],
      range: (it.weaponRange as { normal: number; long: number } | null) ?? null,
      magical: it.magical,
      magicBonus: 0,
    };

    const atk = weaponAttack(attackData, modifiers, profBonus, weaponProficiencies);
    const rangeLabel =
      attackData.range && attackData.range.normal > 0
        ? `${attackData.range.normal}/${attackData.range.long} ft`
        : "Melee";

    const notes: string[] = [];
    if (!atk.isProficient) notes.push("not proficient");
    if ((it.properties ?? []).includes("versatile")) notes.push("versatile (2h dmg on card)");

    out.push({
      inventoryItemId: inv.id,
      name: it.name,
      attackBonus: atk.attackBonus,
      damageDice: atk.damageDice,
      damageBonus: atk.damageBonus,
      damageFormula: formatDamageFormula(atk.damageDice, atk.damageBonus),
      damageType: atk.damageType,
      abilityUsed: atk.abilityUsed,
      isProficient: atk.isProficient,
      rangeLabel,
      notes: notes.join(" · "),
    });
  }
  return out;
}

export function computeArmorClassFromEquipment(
  inventory: InventoryItem[],
  itemBySlug: Record<string, DbItem>,
  modifiers: AbilityModifiers,
  acBonus: number,
): { ac: number; armorLabel: string | null; shieldEquipped: boolean; stealthDisadvantageFromArmor: boolean } {
  const { body, shield, stealthDisadvantage, armorLabel } = resolveEquippedArmor(inventory, itemBySlug);
  const armorData = buildArmorData(body, shield);
  const ac = armorClass(armorData, modifiers, acBonus);
  return {
    ac,
    armorLabel,
    shieldEquipped: shield,
    stealthDisadvantageFromArmor: stealthDisadvantage,
  };
}
