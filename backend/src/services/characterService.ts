import { prisma } from "../config/database";
import { NotFoundError, ValidationError } from "../middleware/errorHandler";
import { meetsMulticlassPrerequisite } from "../lib/multiclassPrereqs";
import { computeCreateProficienciesFromClasses } from "../lib/multiclassEntryProficiencies";
import {
  CreateCharacterInput,
  UpdateCharacterInput,
  HpChangeInput,
  DeathSaveInput,
  RestInput,
  AddConditionInput,
  AddInventoryInput,
  UpdateInventoryInput,
  AddSpellInput,
  UpdateSpellInput,
  LevelUpInput,
  AddFeatureInput,
} from "./characterSchemas";
import {
  allModifiers,
  allSkills,
  allSavingThrows,
  passiveScore,
  spellSaveDc,
  spellAttackBonus,
  initiativeModifier,
  carryingCapacity,
  pushDragLift,
  proficiencyBonus,
  maxHpMulticlass,
  spellSlotsForMulticlass,
  multiclassSpellcasterLevel,
  rollDie,
  type MulticlassSlice,
  AbilityName,
} from "./calculationService";
import {
  computeArmorClassFromEquipment,
  computeEquippedWeaponSummaries,
} from "./equipmentCompute";
import {
  SUBCLASS_CHOICE_CLASS_LEVEL,
  classTierHasPhbAbilityImprovement,
  isAsiFeatureName,
} from "../lib/classProgression";
import { assertValidStartingSpells, validateAddSpell } from "./spellCastingRules";
import { buildItemMapForInventorySlugs } from "../util/itemSlugResolve";

/** Subraces that replace the parent race’s typical walking speed (parent row stays SRD/base). */
function walkingSpeedFromRaceAndSubrace(
  raceSpeed: number,
  raceSlug: string,
  subraceSlug: string | undefined | null,
): number {
  const base = raceSpeed > 0 ? raceSpeed : 30;
  if (raceSlug === "elf" && (subraceSlug ?? "").trim().toLowerCase() === "wood-elf") return 35;
  return base;
}

const CHARACTER_INCLUDE = {
  inventory: true,
  spells:    true,
  spellSlots: true,
  features:   true,
  conditions: true,
  notes:      true,
  classLevels: { orderBy: { sortOrder: "asc" as const } },
} as const;

export async function listCharacters() {
  return prisma.character.findMany({
    select: {
      id: true, name: true, raceSlug: true, classSlug: true,
      level: true, currentHp: true, maxHp: true, updatedAt: true,
      tokenPortraitUrl: true,
    },
    orderBy: { updatedAt: "desc" },
  });
}

type NormalizedClassSlice = {
  classSlug: string;
  subclassSlug: string | null;
  levels: number;
  sortOrder: number;
};

function normalizeClassSlices(input: CreateCharacterInput): NormalizedClassSlice[] {
  if (input.classLevels?.length) {
    const sorted = [...input.classLevels].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );
    return sorted.map((r, i) => ({
      classSlug: r.classSlug,
      subclassSlug: r.subclassSlug?.trim() ? r.subclassSlug.trim() : null,
      levels: r.levels,
      sortOrder: r.sortOrder ?? i,
    }));
  }
  return [
    {
      classSlug: input.classSlug,
      subclassSlug: input.subclassSlug?.trim() ? input.subclassSlug.trim() : null,
      levels: input.level,
      sortOrder: 0,
    },
  ];
}

function toMulticlassSlices(char: { classSlug: string; subclassSlug: string | null; level: number; classLevels?: unknown }): MulticlassSlice[] {
  const rows = char.classLevels as
    | { classSlug: string; subclassSlug: string | null; levels: number; sortOrder: number }[]
    | undefined;
  if (rows?.length) {
    return [...rows]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({
        classSlug: r.classSlug,
        subclassSlug: r.subclassSlug,
        levels: r.levels,
      }));
  }
  return [
    {
      classSlug: char.classSlug,
      subclassSlug: char.subclassSlug,
      levels: char.level,
    },
  ];
}

function inferSpellcastingAbility(
  slices: NormalizedClassSlice[],
  classBySlug: Record<string, { spellcastingAbility: string | null }>,
): AbilityName | null {
  const ordered = [...slices].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const s of ordered) {
    const abil = classBySlug[s.classSlug]?.spellcastingAbility;
    if (abil === "intelligence" || abil === "wisdom" || abil === "charisma") return abil;
  }
  return null;
}

export async function createCharacter(input: CreateCharacterInput) {
  const slices = normalizeClassSlices(input);
  const classSlugs = [...new Set(slices.map((s) => s.classSlug))];
  const classes = await prisma.class.findMany({
    where: { slug: { in: classSlugs } },
    select: {
      slug: true,
      hitDie: true,
      armorProficiencies: true,
      weaponProficiencies: true,
      toolProficiencies: true,
      savingThrows: true,
      spellcastingAbility: true,
    },
  });
  const classBySlug = Object.fromEntries(classes.map((c) => [c.slug, c]));
  for (const s of slices) {
    if (!classBySlug[s.classSlug]) throw new ValidationError(`Unknown class: ${s.classSlug}`);
  }

  const bg = await prisma.background.findUnique({
    where: { slug: input.backgroundSlug },
    select: { skillProficiencies: true, toolProficiencies: true },
  });
  const race = await prisma.race.findUnique({
    where: { slug: input.raceSlug },
    select: { speed: true, abilityBonuses: true },
  });

  let subBonuses: unknown = null;
  if (input.subraceSlug) {
    const sub = await prisma.subrace.findUnique({
      where: { slug: input.subraceSlug },
      select: { abilityBonuses: true, raceSlug: true },
    });
    if (sub && sub.raceSlug === input.raceSlug) subBonuses = sub.abilityBonuses;
  }

  const racial = mergeRacialBonusMaps(race?.abilityBonuses, subBonuses);
  const applyRace = (key: AbilityName) =>
    clampAbilityScore(input[key] + (racial[key] ?? 0));

  const strength = applyRace("strength");
  const dexterity = applyRace("dexterity");
  const constitution = applyRace("constitution");
  const intelligence = applyRace("intelligence");
  const wisdom = applyRace("wisdom");
  const charisma = applyRace("charisma");

  const scoreMapForMc = {
    strength,
    dexterity,
    constitution,
    intelligence,
    wisdom,
    charisma,
  };
  if (classSlugs.length > 1) {
    const ordered = [...slices].sort((a, b) => a.sortOrder - b.sortOrder);
    const seenMc = new Set<string>();
    for (const seg of ordered) {
      const slug = seg.classSlug;
      if (!slug || seenMc.has(slug)) continue;
      if (seenMc.size > 0 && !meetsMulticlassPrerequisite(slug, scoreMapForMc)) {
        throw new ValidationError(
          `Multiclass prerequisite not met for ${slug} (PHB p.164 — adjust ability scores or class choice).`,
        );
      }
      seenMc.add(slug);
    }
  }

  const conMod = Math.floor((constitution - 10) / 2);
  const hitDieBySlug: Record<string, number> = {};
  for (const s of slices) {
    hitDieBySlug[s.classSlug] = classBySlug[s.classSlug]!.hitDie;
  }

  const computedMaxHp = maxHpMulticlass(
    slices.map((s) => ({ classSlug: s.classSlug, levels: s.levels })),
    hitDieBySlug,
    conMod,
  );

  const maxHp = input.maxHp > 0 ? input.maxHp : computedMaxHp;
  const currentHp = input.currentHp ?? maxHp;

  const mergedSaves = uniqStr([...input.savingThrowProficiencies]);
  const skillProficiencies = uniqStr([...input.skillProficiencies, ...(bg?.skillProficiencies ?? [])]);
  const classCreateProfs = computeCreateProficienciesFromClasses(
    slices.map((s) => ({ classSlug: s.classSlug, sortOrder: s.sortOrder })),
    classBySlug,
  );
  const toolProficiencies = uniqStr([
    ...input.toolProficiencies,
    ...(bg?.toolProficiencies ?? []),
    ...classCreateProfs.tools,
  ]);
  const weaponProficiencies = uniqStr([
    ...input.weaponProficiencies,
    ...classCreateProfs.weapons,
  ]);
  const armorProficiencies = uniqStr([
    ...input.armorProficiencies,
    ...classCreateProfs.armor,
  ]);

  const raceBaseSpeed =
    race != null && typeof race.speed === "number" && race.speed > 0 ? race.speed : input.speed;
  const speed = walkingSpeedFromRaceAndSubrace(raceBaseSpeed, input.raceSlug, input.subraceSlug);

  const slotSlices: MulticlassSlice[] = slices.map((s) => ({
    classSlug: s.classSlug,
    subclassSlug: s.subclassSlug,
    levels: s.levels,
  }));
  const slots = spellSlotsForMulticlass(slotSlices);

  const inferredSpell = inferSpellcastingAbility(slices, classBySlug);
  const spellcastingAbility =
    input.spellcastingAbility ?? inferredSpell ?? undefined;

  const first = slices[0]!;
  const firstHitDie = classBySlug[first.classSlug]!.hitDie;

  const { startingInventory, startingSpells = [], classLevels: _cl, ...charScalar } = input;

  const sliceForSpells = normalizeClassSlices(input).map((s) => ({
    classSlug: s.classSlug,
    subclassSlug: s.subclassSlug,
    levels: s.levels,
  }));
  await assertValidStartingSpells(
    sliceForSpells,
    intelligence,
    wisdom,
    charisma,
    startingSpells,
  );

  const character = await prisma.character.create({
    data: {
      ...charScalar,
      classSlug: first.classSlug,
      subclassSlug: first.subclassSlug,
      strength,
      dexterity,
      constitution,
      intelligence,
      wisdom,
      charisma,
      speed,
      maxHp,
      currentHp,
      savingThrowProficiencies: mergedSaves,
      skillProficiencies,
      toolProficiencies,
      weaponProficiencies,
      armorProficiencies,
      hitDieType: firstHitDie,
      hitDiceMax: input.level,
      hitDiceUsed: 0,
      spellcastingAbility: spellcastingAbility ?? null,
      classLevels: {
        create: slices.map((s) => ({
          classSlug: s.classSlug,
          subclassSlug: s.subclassSlug,
          levels: s.levels,
          hitDiceUsed: 0,
          sortOrder: s.sortOrder,
        })),
      },
      spellSlots: {
        create: slots.map((s) => ({ level: s.level, total: s.total, used: 0 })),
      },
    },
    include: CHARACTER_INCLUDE,
  });

  if (startingInventory?.length) {
    await prisma.inventoryItem.createMany({
      data: startingInventory.map((row) => ({
        characterId: character.id,
        itemSlug: row.itemSlug ?? null,
        customName: row.customName ?? null,
        quantity: row.quantity,
        notes: row.notes ?? "",
        equipped: row.equipped ?? false,
      })),
    });
  }

  if (startingSpells.length) {
    await prisma.characterSpell.createMany({
      data: startingSpells.map((row) => ({
        characterId: character.id,
        spellSlug: row.spellSlug,
        prepared: row.prepared ?? false,
        alwaysPrepared: row.alwaysPrepared ?? false,
      })),
    });
  }

  const full = await prisma.character.findUnique({
    where: { id: character.id },
    include: CHARACTER_INCLUDE,
  });
  if (!full) throw new NotFoundError("Character");
  return await enrichCharacter(full);
}

export async function getCharacter(id: string) {
  let character = await prisma.character.findUnique({
    where: { id },
    include: CHARACTER_INCLUDE,
  });
  if (!character) throw new NotFoundError("Character");
  if (!character.classLevels?.length) {
    await prisma.characterClassLevel.create({
      data: {
        characterId: character.id,
        classSlug: character.classSlug,
        subclassSlug: character.subclassSlug,
        levels: character.level,
        hitDiceUsed: character.hitDiceUsed,
        sortOrder: 0,
      },
    });
    character = await prisma.character.findUnique({
      where: { id },
      include: CHARACTER_INCLUDE,
    });
    if (!character) throw new NotFoundError("Character");
  }
  return await enrichCharacter(character);
}

export async function updateCharacter(id: string, input: UpdateCharacterInput) {
  await assertExists(id);
  const character = await prisma.character.update({
    where: { id },
    data: input,
    include: CHARACTER_INCLUDE,
  });
  return await enrichCharacter(character);
}

async function classTierGrantsAsi(
  classSlug: string,
  subclassSlug: string | null | undefined,
  classTier: number,
): Promise<boolean> {
  if (classTierHasPhbAbilityImprovement(classSlug, classTier)) return true;
  const cfs = await prisma.classFeature.findMany({
    where: { classSlug, level: classTier },
    select: { name: true },
  });
  if (cfs.some((f) => isAsiFeatureName(f.name))) return true;
  const sub = subclassSlug?.trim();
  if (sub) {
    const sfs = await prisma.subclassFeature.findMany({
      where: { subclassSlug: sub, level: classTier },
      select: { name: true },
    });
    if (sfs.some((f) => isAsiFeatureName(f.name))) return true;
  }
  return false;
}

/** Advance one level in one class: HP uses that class's hit die; sync multiclass spell slots. */
export async function levelUpCharacter(id: string, input: LevelUpInput) {
  const char = await prisma.character.findUnique({ where: { id }, include: CHARACTER_INCLUDE });
  if (!char) throw new NotFoundError("Character");
  if (char.level >= 20) throw new ValidationError("Character is already level 20");

  const rows = char.classLevels ?? [];
  if (!rows.length) throw new ValidationError("Character has no class rows; re-save the character.");

  let target = rows[0]!;
  if (rows.length > 1) {
    const slug = input.classSlug?.trim();
    if (!slug) {
      throw new ValidationError("Multiclass: pass classSlug for the class you are adding a level to.");
    }
    const found = rows.find((r) => r.classSlug === slug);
    if (!found) throw new ValidationError(`No class row for "${slug}".`);
    target = found;
  }

  const newClassLevel = target.levels + 1;
  const choiceLv = SUBCLASS_CHOICE_CLASS_LEVEL[target.classSlug];
  const needsSubclassByRule =
    choiceLv != null && choiceLv === newClassLevel && !(target.subclassSlug ?? "").trim();
  const subclassCountForClass = needsSubclassByRule
    ? await prisma.subclass.count({ where: { classSlug: target.classSlug } })
    : 0;
  const needsSubclass = needsSubclassByRule && subclassCountForClass > 0;

  if (needsSubclass && !input.subclassSlug?.trim()) {
    throw new ValidationError(
      `Choose a subclass for your ${target.classSlug.replace(/-/g, " ")} — this class gains a subclass at level ${newClassLevel}.`,
    );
  }

  if (input.subclassSlug?.trim()) {
    const subRow = await prisma.subclass.findUnique({ where: { slug: input.subclassSlug.trim() } });
    if (!subRow || subRow.classSlug !== target.classSlug) {
      throw new ValidationError("That subclass does not belong to the class you are leveling.");
    }
    const existingSub = (target.subclassSlug ?? "").trim();
    if (existingSub && existingSub !== input.subclassSlug.trim()) {
      throw new ValidationError("Subclass is already set for this class.");
    }
  }

  const subclassForAsi =
    (input.subclassSlug?.trim() ?? target.subclassSlug ?? "").trim() || null;

  if (input.abilityScoreImprovement?.length) {
    const allowed = await classTierGrantsAsi(target.classSlug, subclassForAsi, newClassLevel);
    if (!allowed) {
      throw new ValidationError("Ability Score Improvement is not part of this class level in the reference data.");
    }
    const bumps = input.abilityScoreImprovement;
    const sum = bumps.reduce((s, b) => s + b.increase, 0);
    if (sum !== 2) {
      throw new ValidationError("Ability score increases must total exactly +2 (either +2 on one score or +1 on two).");
    }
    const seen = new Set<string>();
    for (const b of bumps) {
      if (seen.has(b.ability)) throw new ValidationError("Each ability can only be increased once.");
      seen.add(b.ability);
      const cur = char[b.ability as keyof typeof char] as number;
      if (typeof cur !== "number" || cur + b.increase > 30) {
        throw new ValidationError("Ability scores cannot exceed 30.");
      }
    }
  }

  for (const s of input.learnSpells ?? []) {
    const sp = await prisma.spell.findUnique({ where: { slug: s.spellSlug }, select: { slug: true } });
    if (!sp) throw new ValidationError(`Unknown spell: ${s.spellSlug}`);
  }

  const clsRow = await prisma.class.findUnique({
    where: { slug: target.classSlug },
    select: { hitDie: true },
  });
  const hitDie = clsRow?.hitDie ?? char.hitDieType;

  const newLevel = char.level + 1;
  const mods = allModifiers({
    strength: char.strength,
    dexterity: char.dexterity,
    constitution: char.constitution,
    intelligence: char.intelligence,
    wisdom: char.wisdom,
    charisma: char.charisma,
  });
  const conMod = mods.constitution;
  const defaultHp = Math.max(1, Math.floor(hitDie / 2) + 1 + conMod);
  const hpGain = input.hpIncrease ?? defaultHp;

  const rowUpdate: { levels: number; subclassSlug?: string | null } = { levels: target.levels + 1 };
  if (input.subclassSlug?.trim()) {
    rowUpdate.subclassSlug = input.subclassSlug.trim();
  }

  await prisma.characterClassLevel.update({
    where: { id: target.id },
    data: rowUpdate,
  });

  const fresh = await prisma.character.findUnique({
    where: { id },
    include: CHARACTER_INCLUDE,
  });
  if (!fresh) throw new NotFoundError("Character");

  const firstRow = fresh.classLevels![0]!;
  const firstCls = await prisma.class.findUnique({
    where: { slug: firstRow.classSlug },
    select: { hitDie: true },
  });

  await syncSpellSlotsMulticlass(id, toMulticlassSlices(fresh));

  const asiPatch: Partial<Record<AbilityName, number>> = {};
  for (const b of input.abilityScoreImprovement ?? []) {
    const cur = char[b.ability as AbilityName] as number;
    asiPatch[b.ability] = cur + b.increase;
  }

  const primaryMatch = target.classSlug === char.classSlug;
  const charSubclassPatch =
    input.subclassSlug?.trim() && primaryMatch ? { subclassSlug: input.subclassSlug.trim() } : {};

  const updated = await prisma.character.update({
    where: { id },
    data: {
      level: newLevel,
      hitDiceMax: newLevel,
      maxHp: char.maxHp + hpGain,
      currentHp: char.currentHp + hpGain,
      hitDieType: firstCls?.hitDie ?? fresh.hitDieType,
      hitDiceUsed: await sumClassHitDiceUsed(id),
      ...asiPatch,
      ...charSubclassPatch,
    },
    include: CHARACTER_INCLUDE,
  });

  const existingFeatureNames = new Set(
    (updated.features ?? []).map((f: { name: string }) => f.name.trim().toLowerCase()),
  );
  for (const f of input.grantFeatures ?? []) {
    const key = f.name.trim().toLowerCase();
    if (existingFeatureNames.has(key)) continue;
    existingFeatureNames.add(key);
    await prisma.characterFeature.create({
      data: {
        characterId: id,
        name: f.name.trim(),
        description: f.description ?? "",
        source: f.source ?? "class",
        uses: null,
        usesMax: null,
        recharge: null,
      },
    });
  }

  for (const s of input.learnSpells ?? []) {
    await prisma.characterSpell.upsert({
      where: {
        characterId_spellSlug: { characterId: id, spellSlug: s.spellSlug },
      },
      create: {
        characterId: id,
        spellSlug: s.spellSlug,
        prepared: s.prepared ?? false,
        alwaysPrepared: s.alwaysPrepared ?? false,
      },
      update: {},
    });
  }

  return getCharacter(id);
}

async function sumClassHitDiceUsed(characterId: string): Promise<number> {
  const agg = await prisma.characterClassLevel.aggregate({
    where: { characterId },
    _sum: { hitDiceUsed: true },
  });
  return agg._sum.hitDiceUsed ?? 0;
}

async function syncSpellSlotsMulticlass(characterId: string, slices: MulticlassSlice[]) {
  const desired = spellSlotsForMulticlass(slices);
  const desiredLevels = new Set(desired.map((d) => d.level));
  const existing = await prisma.spellSlot.findMany({ where: { characterId } });

  for (const d of desired) {
    const ex = existing.find((s) => s.level === d.level);
    if (ex) {
      await prisma.spellSlot.update({
        where: { id: ex.id },
        data: { total: d.total, used: Math.min(ex.used, d.total) },
      });
    } else {
      await prisma.spellSlot.create({
        data: { characterId, level: d.level, total: d.total, used: 0 },
      });
    }
  }
  for (const ex of existing) {
    if (!desiredLevels.has(ex.level)) {
      await prisma.spellSlot.delete({ where: { id: ex.id } });
    }
  }
}

export async function deleteCharacter(id: string) {
  await assertExists(id);
  await prisma.sessionCharacter.deleteMany({ where: { characterId: id } });
  await prisma.character.delete({ where: { id } });
}

export async function changeHp(id: string, input: HpChangeInput) {
  const char = await prisma.character.findUnique({
    where: { id },
    select: { currentHp: true, maxHp: true, temporaryHp: true },
  });
  if (!char) throw new NotFoundError("Character");

  let { currentHp, temporaryHp } = char;
  const { maxHp } = char;

  if (input.type === "damage") {
    let remaining = input.amount;
    if (temporaryHp > 0) {
      const absorbed = Math.min(temporaryHp, remaining);
      temporaryHp -= absorbed;
      remaining -= absorbed;
    }
    currentHp = Math.max(0, currentHp - remaining);
  } else if (input.type === "heal") {
    currentHp = Math.min(maxHp, currentHp + input.amount);
  } else if (input.type === "temporary") {
    temporaryHp = Math.max(temporaryHp, input.amount);
  } else if (input.type === "set") {
    currentHp = Math.max(0, Math.min(maxHp, input.amount));
  }

  const resetDeathSaves = currentHp > 0;

  const updated = await prisma.character.update({
    where: { id },
    data: {
      currentHp,
      temporaryHp,
      ...(resetDeathSaves && {
        deathSaveSuccesses: 0,
        deathSaveFailures: 0,
        isStabilized: false,
      }),
    },
    include: CHARACTER_INCLUDE,
  });

  return await enrichCharacter(updated);
}

export async function recordDeathSave(id: string, input: DeathSaveInput) {
  const char = await prisma.character.findUnique({
    where: { id },
    select: { deathSaveSuccesses: true, deathSaveFailures: true },
  });
  if (!char) throw new NotFoundError("Character");

  let { deathSaveSuccesses, deathSaveFailures } = char;

  if (input.result === "success") {
    if (input.natural20) {
      const updated = await prisma.character.update({
        where: { id },
        data: { currentHp: 1, deathSaveSuccesses: 0, deathSaveFailures: 0 },
        include: CHARACTER_INCLUDE,
      });
      return { ...(await enrichCharacter(updated)), event: "regained_consciousness" };
    }
    deathSaveSuccesses = Math.min(3, deathSaveSuccesses + 1);
  } else {
    deathSaveFailures = Math.min(3, deathSaveFailures + 1);
  }

  const event =
    deathSaveSuccesses >= 3 ? "stabilized" :
    deathSaveFailures >= 3 ? "dead" : "ongoing";

  const updated = await prisma.character.update({
    where: { id },
    data: { deathSaveSuccesses, deathSaveFailures, isStabilized: event === "stabilized" },
    include: CHARACTER_INCLUDE,
  });

  return { ...(await enrichCharacter(updated)), event };
}

export async function stabilize(id: string) {
  await assertExists(id);
  const updated = await prisma.character.update({
    where: { id },
    data: { isStabilized: true, deathSaveSuccesses: 0, deathSaveFailures: 0 },
    include: CHARACTER_INCLUDE,
  });
  return await enrichCharacter(updated);
}

export async function takeRest(id: string, input: RestInput) {
  const char = await prisma.character.findUnique({
    where: { id },
    include: CHARACTER_INCLUDE,
  });
  if (!char) throw new NotFoundError("Character");
  if (input.type === "short") {
    return shortRest(char, input.hitDiceToSpend, input.hitDiceFrom);
  }
  return longRest(char);
}

async function getClassHitDie(classSlug: string): Promise<number> {
  const c = await prisma.class.findUnique({ where: { slug: classSlug }, select: { hitDie: true } });
  return c?.hitDie ?? 8;
}

async function shortRest(
  char: any,
  hitDiceToSpend: number,
  hitDiceFrom?: RestInput["hitDiceFrom"],
) {
  const mods = allModifiers({
    strength: char.strength,
    dexterity: char.dexterity,
    constitution: char.constitution,
    intelligence: char.intelligence,
    wisdom: char.wisdom,
    charisma: char.charisma,
  });
  const rows = [...(char.classLevels ?? [])] as {
    id: string;
    classSlug: string;
    levels: number;
    hitDiceUsed: number;
  }[];
  if (!rows.length) throw new ValidationError("Character has no class rows.");

  if (hitDiceToSpend <= 0) {
    const re = await prisma.character.findUnique({ where: { id: char.id }, include: CHARACTER_INCLUDE });
    return { ...(await enrichCharacter(re!)), hpRecovered: 0, hitDiceSpent: 0 };
  }

  let hpRecovered = 0;

  if (rows.length === 1) {
    const row = rows[0]!;
    const available = row.levels - row.hitDiceUsed;
    const diceUsed = Math.min(hitDiceToSpend, available);
    const hd = await getClassHitDie(row.classSlug);
    for (let i = 0; i < diceUsed; i++) {
      hpRecovered += Math.max(1, rollDie(hd) + mods.constitution);
    }
    await prisma.characterClassLevel.update({
      where: { id: row.id },
      data: { hitDiceUsed: row.hitDiceUsed + diceUsed },
    });
  } else {
    if (!hitDiceFrom?.length) {
      throw new ValidationError(
        "Multiclass short rest: include hitDiceFrom: [{ characterClassLevelId, amount }, ...] matching hitDiceToSpend.",
      );
    }
    const totalAlloc = hitDiceFrom.reduce((s, a) => s + a.amount, 0);
    if (totalAlloc !== hitDiceToSpend) {
      throw new ValidationError("hitDiceFrom amounts must add up to hitDiceToSpend.");
    }
    for (const alloc of hitDiceFrom) {
      const row = rows.find((r) => r.id === alloc.characterClassLevelId);
      if (!row) throw new ValidationError("Unknown characterClassLevelId in hitDiceFrom.");
      const available = row.levels - row.hitDiceUsed;
      if (alloc.amount > available) throw new ValidationError("Not enough hit dice in that class pool.");
      const hd = await getClassHitDie(row.classSlug);
      for (let i = 0; i < alloc.amount; i++) {
        hpRecovered += Math.max(1, rollDie(hd) + mods.constitution);
      }
      await prisma.characterClassLevel.update({
        where: { id: row.id },
        data: { hitDiceUsed: row.hitDiceUsed + alloc.amount },
      });
    }
  }

  const usedSum = await sumClassHitDiceUsed(char.id);
  const updated = await prisma.character.update({
    where: { id: char.id },
    data: {
      currentHp: Math.min(char.maxHp, char.currentHp + hpRecovered),
      hitDiceUsed: usedSum,
    },
    include: CHARACTER_INCLUDE,
  });
  return { ...(await enrichCharacter(updated)), hpRecovered, hitDiceSpent: hitDiceToSpend };
}

async function longRest(char: any) {
  const spentBefore = char.hitDiceUsed;
  await prisma.spellSlot.updateMany({ where: { characterId: char.id }, data: { used: 0 } });
  await prisma.characterFeature.updateMany({
    where: { characterId: char.id, recharge: { in: ["long_rest", "dawn"] } },
    data: { uses: 0 },
  });
  await prisma.characterClassLevel.updateMany({
    where: { characterId: char.id },
    data: { hitDiceUsed: 0 },
  });
  const updated = await prisma.character.update({
    where: { id: char.id },
    data: {
      currentHp: char.maxHp,
      temporaryHp: 0,
      hitDiceUsed: 0,
      deathSaveSuccesses: 0,
      deathSaveFailures: 0,
      isStabilized: false,
    },
    include: CHARACTER_INCLUDE,
  });
  return { ...(await enrichCharacter(updated)), hitDiceRecovered: spentBefore };
}

export async function updateSpellSlot(id: string, slotLevel: number, action: string, amount: number) {
  const slot = await prisma.spellSlot.findUnique({
    where: { characterId_level: { characterId: id, level: slotLevel } },
  });
  if (!slot) throw new NotFoundError(`Spell slot level ${slotLevel}`);
  let used = slot.used;
  if (action === "use") used = Math.min(slot.total, used + amount);
  else if (action === "recover") used = Math.max(0, used - amount);
  else if (action === "set") used = Math.max(0, Math.min(slot.total, amount));
  return prisma.spellSlot.update({
    where: { characterId_level: { characterId: id, level: slotLevel } },
    data: { used },
  });
}

export async function addCondition(id: string, input: AddConditionInput) {
  await assertExists(id);
  return prisma.characterCondition.create({ data: { characterId: id, ...input } });
}

export async function removeCondition(_characterId: string, conditionId: string) {
  await prisma.characterCondition.delete({ where: { id: conditionId } });
}

export async function addInventoryItem(id: string, input: AddInventoryInput) {
  await assertExists(id);
  return prisma.inventoryItem.create({ data: { characterId: id, ...input } });
}

export async function updateInventoryItem(_characterId: string, itemId: string, input: UpdateInventoryInput) {
  return prisma.inventoryItem.update({ where: { id: itemId }, data: input });
}

export async function removeInventoryItem(_characterId: string, itemId: string) {
  await prisma.inventoryItem.delete({ where: { id: itemId } });
}

export async function addSpell(id: string, input: AddSpellInput) {
  await assertExists(id);
  const char = await prisma.character.findUnique({
    where: { id },
    include: { spells: true, classLevels: { orderBy: { sortOrder: "asc" } } },
  });
  if (!char) throw new NotFoundError("Character");
  if (char.spells.some((s) => s.spellSlug === input.spellSlug)) {
    throw new ValidationError("You already have that spell.");
  }
  const newSpell = await prisma.spell.findUnique({ where: { slug: input.spellSlug } });
  if (!newSpell) throw new ValidationError("Unknown spell.");
  const err = await validateAddSpell(
    toMulticlassSlices(char),
    char.intelligence,
    char.wisdom,
    char.charisma,
    char.spells.map((s) => ({
      spellSlug: s.spellSlug,
      prepared: s.prepared,
      alwaysPrepared: s.alwaysPrepared,
    })),
    newSpell,
  );
  if (err) throw new ValidationError(err);
  return prisma.characterSpell.create({ data: { characterId: id, ...input } });
}

export async function updateSpell(_characterId: string, spellId: string, input: UpdateSpellInput) {
  return prisma.characterSpell.update({ where: { id: spellId }, data: input });
}

export async function removeSpell(_characterId: string, spellId: string) {
  await prisma.characterSpell.delete({ where: { id: spellId } });
}

export async function addCharacterFeature(id: string, input: AddFeatureInput) {
  await assertExists(id);
  await prisma.characterFeature.create({
    data: {
      characterId: id,
      name: input.name,
      description: input.description,
      source: input.source,
      uses: input.uses ?? null,
      usesMax: input.usesMax ?? null,
      recharge: input.recharge ?? null,
    },
  });
  return getCharacter(id);
}

async function enrichCharacter(char: any) {
  const inventory = (char.inventory ?? []) as { itemSlug: string | null }[];
  const slugList = inventory
    .map((i) => i.itemSlug)
    .filter((s): s is string => typeof s === "string" && s.length > 0);
  const itemBySlug = await buildItemMapForInventorySlugs(prisma, slugList);

  const scores = {
    strength: char.strength, dexterity: char.dexterity, constitution: char.constitution,
    intelligence: char.intelligence, wisdom: char.wisdom, charisma: char.charisma,
  };
  const mods  = allModifiers(scores);
  const profB = proficiencyBonus(char.level);
  const skills = allSkills(mods, profB, char.skillProficiencies, char.skillExpertise);
  const saves  = allSavingThrows(mods, profB, char.savingThrowProficiencies);

  const equip = computeArmorClassFromEquipment(char.inventory ?? [], itemBySlug, mods, char.acBonus ?? 0);
  const weaponAttacks = computeEquippedWeaponSummaries(
    char.inventory ?? [],
    itemBySlug,
    mods,
    profB,
    char.weaponProficiencies ?? [],
  );

  const mcSlices = toMulticlassSlices(char);
  const isMulticlass = mcSlices.length > 1;
  const classSummary = mcSlices
    .map((s) => `${s.classSlug.replace(/-/g, " ")} ${s.levels}`)
    .join(" / ");
  const mcSpellLevel = multiclassSpellcasterLevel(mcSlices);

  const classLevelsDetailed = await Promise.all(
    ((char.classLevels ?? []) as {
      id: string;
      classSlug: string;
      subclassSlug: string | null;
      levels: number;
      hitDiceUsed: number;
      sortOrder: number;
    }[]).map(async (r) => {
      const hd = await getClassHitDie(r.classSlug);
      return {
        id: r.id,
        classSlug: r.classSlug,
        subclassSlug: r.subclassSlug,
        levels: r.levels,
        hitDiceUsed: r.hitDiceUsed,
        sortOrder: r.sortOrder,
        hitDie: hd,
        hitDiceAvailable: Math.max(0, r.levels - r.hitDiceUsed),
      };
    }),
  );

  return {
    ...char,
    computed: {
      modifiers: mods,
      proficiencyBonus: profB,
      skills,
      savingThrows: saves,
      armorClass: equip.ac,
      armorSource: equip.armorLabel,
      shieldEquipped: equip.shieldEquipped,
      stealthDisadvantageFromArmor: equip.stealthDisadvantageFromArmor,
      weaponAttacks,
      initiative: initiativeModifier(mods, char.initiativeBonus),
      passivePerception:    passiveScore(skills["perception"].bonus),
      passiveInsight:       passiveScore(skills["insight"].bonus),
      passiveInvestigation: passiveScore(skills["investigation"].bonus),
      carryingCapacity: carryingCapacity(char.strength),
      pushDragLift:     pushDragLift(char.strength),
      spellSaveDc: char.spellcastingAbility
        ? spellSaveDc(char.spellcastingAbility as AbilityName, mods, profB) : null,
      spellAttackBonus: char.spellcastingAbility
        ? spellAttackBonus(char.spellcastingAbility as AbilityName, mods, profB) : null,
      classSummary,
      isMulticlass,
      multiclassSpellcasterLevel: mcSpellLevel,
      classLevelsDetailed,
    },
  };
}

function mergeRacialBonusMaps(...sources: unknown[]): Record<AbilityName, number> {
  const out: Partial<Record<AbilityName, number>> = {};
  const keys: AbilityName[] = [
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
  ];
  for (const src of sources) {
    if (!Array.isArray(src)) continue;
    for (const row of src) {
      if (!row || typeof row !== "object") continue;
      const ability = String((row as { ability?: string }).ability ?? "")
        .toLowerCase()
        .trim() as AbilityName;
      const bonus = Number((row as { bonus?: unknown }).bonus) || 0;
      if (keys.includes(ability)) {
        out[ability] = (out[ability] ?? 0) + bonus;
      }
    }
  }
  return {
    strength:     out.strength ?? 0,
    dexterity:    out.dexterity ?? 0,
    constitution: out.constitution ?? 0,
    intelligence: out.intelligence ?? 0,
    wisdom:       out.wisdom ?? 0,
    charisma:     out.charisma ?? 0,
  };
}

function clampAbilityScore(n: number): number {
  return Math.min(20, Math.max(1, Math.round(n)));
}

function uniqStr(list: string[]): string[] {
  return [...new Set(list.map((s) => s.trim()).filter((s) => s.length > 0))];
}

async function assertExists(id: string) {
  const exists = await prisma.character.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError("Character");
}
