import { Request, Response } from "express";
import { prisma } from "../config/database";
import { NotFoundError } from "../middleware/errorHandler";
import {
  allModifiers, allSkills, allSavingThrows, weaponAttack,
  initiativeModifier, rollDie, proficiencyBonus, AbilityName,
} from "../services/calculationService";

function getCharacterStats(char: any) {
  const scores = {
    strength: char.strength, dexterity: char.dexterity, constitution: char.constitution,
    intelligence: char.intelligence, wisdom: char.wisdom, charisma: char.charisma,
  };
  const mods  = allModifiers(scores);
  const profB = proficiencyBonus(char.level);
  return { mods, profB };
}

export const rollAttack = async (req: Request<{ id: string }>, res: Response) => {
  const char = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: { inventory: true },
  });
  if (!char) throw new NotFoundError("Character");

  const { weaponItemId, advantage } = req.body;
  const invItem = char.inventory.find((i: any) => i.id === weaponItemId);
  if (!invItem) throw new NotFoundError("Inventory item");

  // Look up item stats
  const item = invItem.itemSlug
    ? await prisma.item.findUnique({ where: { slug: invItem.itemSlug } })
    : null;

  const { mods, profB } = getCharacterStats(char);

  const attackData = {
    weaponSlug:  invItem.itemSlug ?? "custom",
    weaponName:  item?.name ?? invItem.customName ?? "Weapon",
    subcategory: item?.subcategory ?? null,
    damageDice:  item?.damageDice ?? "1d4",
    damageType:  item?.damageType ?? "bludgeoning",
    properties:  (item?.properties ?? []) as string[],
    range:       item?.weaponRange as { normal: number; long: number } | null ?? null,
    magical:     item?.magical ?? false,
    magicBonus:  0,
  };

  const result = weaponAttack(attackData, mods, profB, char.weaponProficiencies);

  // Roll the attack if advantage/disadvantage
  const d1 = rollDie(20);
  const d2 = rollDie(20);
  const attackRoll =
    advantage === "advantage"    ? Math.max(d1, d2) :
    advantage === "disadvantage" ? Math.min(d1, d2) : d1;

  const isCrit    = attackRoll === 20;
  const isFumble  = attackRoll === 1;
  const total     = attackRoll + result.attackBonus;

  res.json({
    attackRoll, d1, d2, advantage,
    attackBonus: result.attackBonus,
    total,
    isCrit, isFumble,
    damageDice:  isCrit ? `${result.damageDice}+${result.damageDice}` : result.damageDice,
    damageBonus: result.damageBonus,
    damageType:  result.damageType,
    abilityUsed: result.abilityUsed,
    isProficient: result.isProficient,
  });
};

export const rollSave = async (req: Request<{ id: string }>, res: Response) => {
  const char = await prisma.character.findUnique({ where: { id: req.params.id } });
  if (!char) throw new NotFoundError("Character");

  const { ability, advantage } = req.body;
  const { mods, profB } = getCharacterStats(char);
  const saves = allSavingThrows(mods, profB, char.savingThrowProficiencies);
  const save  = saves[ability as AbilityName];

  const d1 = rollDie(20);
  const d2 = rollDie(20);
  const roll =
    advantage === "advantage"    ? Math.max(d1, d2) :
    advantage === "disadvantage" ? Math.min(d1, d2) : d1;

  res.json({
    ability, advantage, d1, d2,
    roll,
    bonus:     save.bonus,
    total:     roll + save.bonus,
    proficient: save.proficient,
  });
};

export const rollCheck = async (req: Request<{ id: string }>, res: Response) => {
  const char = await prisma.character.findUnique({ where: { id: req.params.id } });
  if (!char) throw new NotFoundError("Character");

  const { skill, advantage } = req.body;
  const { mods, profB } = getCharacterStats(char);
  const skills = allSkills(mods, profB, char.skillProficiencies, char.skillExpertise);
  const sk     = skills[skill];
  if (!sk) throw new NotFoundError(`Skill: ${skill}`);

  const d1 = rollDie(20);
  const d2 = rollDie(20);
  const roll =
    advantage === "advantage"    ? Math.max(d1, d2) :
    advantage === "disadvantage" ? Math.min(d1, d2) : d1;

  res.json({
    skill, advantage, d1, d2,
    roll,
    bonus:      sk.bonus,
    total:      roll + sk.bonus,
    ability:    sk.ability,
    proficient: sk.proficient,
    expertise:  sk.expertise,
  });
};

export const rollInitiative = async (req: Request<{ id: string }>, res: Response) => {
  const char = await prisma.character.findUnique({ where: { id: req.params.id } });
  if (!char) throw new NotFoundError("Character");

  const { mods } = getCharacterStats(char);
  const bonus = initiativeModifier(mods, char.initiativeBonus);
  const roll  = rollDie(20);

  res.json({ roll, bonus, total: roll + bonus });
};
