import { prisma } from "../config/database";
import { NotFoundError } from "../middleware/errorHandler";
import { allModifiers, allSkills, allSavingThrows, proficiencyBonus } from "./calculationService";
import type { AbilityName } from "./calculationService";

// ── Sessions ──────────────────────────────────────────────────────
export async function listSessions() {
  return prisma.session.findMany({
    include: { characters: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getSession(id: string) {
  const s = await prisma.session.findUnique({
    where: { id },
    include: { characters: true, combats: { include: { combatants: true } } },
  });
  if (!s) throw new NotFoundError("Session");
  return s;
}

export async function createSession(body: { name: string; dungeonId?: string; storyId?: string }) {
  return prisma.session.create({
    data: body,
    include: { characters: true, combats: true },
  });
}

export async function updateSession(id: string, data: { name?: string; status?: string; notes?: string }) {
  await assertSessionExists(id);
  return prisma.session.update({ where: { id }, data });
}

export async function deleteSession(id: string) {
  await assertSessionExists(id);
  await prisma.session.delete({ where: { id } });
}

export async function addCharacterToSession(sessionId: string, characterId: string, playerName: string) {
  return prisma.sessionCharacter.upsert({
    where: { sessionId_characterId: { sessionId, characterId } },
    create: { sessionId, characterId, playerName, isActive: true },
    update: { isActive: true, playerName },
  });
}

export async function removeCharacterFromSession(sessionId: string, characterId: string) {
  await prisma.sessionCharacter.deleteMany({ where: { sessionId, characterId } });
}

// ── Combat ────────────────────────────────────────────────────────
export interface CombatantInput {
  type:         "player" | "monster";
  characterId?: string;
  monsterSlug?: string;
  label:        string;
  initiative:   number;
  maxHp:        number;
  armorClass:   number;
}

export async function startCombat(sessionId: string, name: string, combatants: CombatantInput[]) {
  await assertSessionExists(sessionId);
  return prisma.combat.create({
    data: {
      sessionId,
      name,
      status: "active",
      round: 1,
      combatants: {
        create: combatants.map((c) => ({
          type:        c.type,
          characterId: c.characterId ?? null,
          monsterSlug: c.monsterSlug ?? null,
          label:       c.label,
          initiative:  c.initiative,
          currentHp:   c.maxHp,
          maxHp:       c.maxHp,
          armorClass:  c.armorClass,
          conditions:  [],
          isAlive:     true,
        })),
      },
    },
    include: { combatants: true },
  });
}

export async function getCombat(combatId: string) {
  const c = await prisma.combat.findUnique({
    where: { id: combatId },
    include: { combatants: true },
  });
  if (!c) throw new NotFoundError("Combat");
  return {
    ...c,
    turnOrder: [...c.combatants]
      .filter((x) => x.isAlive)
      .sort((a, b) => b.initiative - a.initiative),
  };
}

export async function nextRound(combatId: string) {
  const c = await prisma.combat.findUnique({ where: { id: combatId }, select: { id: true } });
  if (!c) throw new NotFoundError("Combat");
  await prisma.combat.update({ where: { id: combatId }, data: { round: { increment: 1 } } });
  return getCombat(combatId);
}

export async function endCombat(combatId: string) {
  const c = await prisma.combat.findUnique({ where: { id: combatId }, select: { id: true } });
  if (!c) throw new NotFoundError("Combat");
  return prisma.combat.update({ where: { id: combatId }, data: { status: "completed" } });
}

export async function updateCombatant(combatantId: string, data: Partial<{
  currentHp:       number;
  temporaryHp:     number;
  conditions:      string[];
  isConcentrating: boolean;
  isAlive:         boolean;
  initiative:      number;
  notes:           string;
}>) {
  const c = await prisma.combatant.findUnique({ where: { id: combatantId }, select: { id: true } });
  if (!c) throw new NotFoundError("Combatant");
  return prisma.combatant.update({ where: { id: combatantId }, data });
}

export async function damageCombatant(combatantId: string, amount: number) {
  const c = await prisma.combatant.findUnique({ where: { id: combatantId } });
  if (!c) throw new NotFoundError("Combatant");

  let remaining    = amount;
  let temporaryHp  = c.temporaryHp;
  if (temporaryHp > 0) {
    const absorbed = Math.min(temporaryHp, remaining);
    temporaryHp   -= absorbed;
    remaining     -= absorbed;
  }
  const currentHp = Math.max(0, c.currentHp - remaining);

  return prisma.combatant.update({
    where: { id: combatantId },
    data:  { currentHp, temporaryHp, isAlive: currentHp > 0 },
  });
}

export async function healCombatant(combatantId: string, amount: number) {
  const c = await prisma.combatant.findUnique({ where: { id: combatantId } });
  if (!c) throw new NotFoundError("Combatant");
  const currentHp = Math.min(c.maxHp, c.currentHp + amount);
  return prisma.combatant.update({
    where: { id: combatantId },
    data:  { currentHp, isAlive: currentHp > 0 },
  });
}

// ── Roll Summary (DM helper) ──────────────────────────────────────
export async function getSessionRollSummary(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      characters: true,
      combats: {
        where:   { status: "active" },
        include: { combatants: { where: { isAlive: true } } },
        take: 1,
      },
    },
  });
  if (!session) throw new NotFoundError("Session");

  const activeCombat = session.combats[0] ?? null;
  if (!activeCombat) return { inCombat: false, combatants: [], playerRolls: [], dmRolls: [] };

  // Load character data for player combatants
  const playerIds = activeCombat.combatants
    .filter((c) => c.type === "player" && c.characterId)
    .map((c) => c.characterId!);

  const characters = await prisma.character.findMany({ where: { id: { in: playerIds } } });

  // Load monster data for monster combatants
  const monsterSlugs = activeCombat.combatants
    .filter((c) => c.type === "monster" && c.monsterSlug)
    .map((c) => c.monsterSlug!);

  const monsters    = await prisma.monster.findMany({ where: { slug: { in: monsterSlugs } } });
  const monsterMap  = Object.fromEntries(monsters.map((m) => [m.slug, m]));

  // Build player roll guides
  const playerRolls = characters.map((char) => {
    const scores = {
      strength:     char.strength,
      dexterity:    char.dexterity,
      constitution: char.constitution,
      intelligence: char.intelligence,
      wisdom:       char.wisdom,
      charisma:     char.charisma,
    };
    const mods   = allModifiers(scores);
    const profB  = proficiencyBonus(char.level);
    const skills = allSkills(mods, profB, char.skillProficiencies, char.skillExpertise);
    const saves  = allSavingThrows(mods, profB, char.savingThrowProficiencies);

    const spellBonus = char.spellcastingAbility
      ? mods[char.spellcastingAbility as AbilityName] + profB
      : null;

    return {
      characterId:       char.id,
      characterName:     char.name,
      classSlug:         char.classSlug,
      level:             char.level,
      currentHp:         char.currentHp,
      maxHp:             char.maxHp,
      initiative:        mods.dexterity + char.initiativeBonus,
      passivePerception: 10 + skills["perception"].bonus,
      keyRolls: {
        attacks: {
          melee:  { bonus: mods.strength  + profB, label: "STR melee" },
          ranged: { bonus: mods.dexterity + profB, label: "DEX ranged" },
          spell:  spellBonus !== null
            ? { bonus: spellBonus, dc: 8 + spellBonus, label: `${char.spellcastingAbility?.slice(0,3).toUpperCase()} spell` }
            : null,
        },
        saves: {
          strength:     { bonus: saves.strength.bonus,     proficient: saves.strength.proficient },
          dexterity:    { bonus: saves.dexterity.bonus,    proficient: saves.dexterity.proficient },
          constitution: { bonus: saves.constitution.bonus, proficient: saves.constitution.proficient },
          wisdom:       { bonus: saves.wisdom.bonus,       proficient: saves.wisdom.proficient },
        },
        skills: {
          perception:    skills["perception"].bonus,
          stealth:       skills["stealth"].bonus,
          athletics:     skills["athletics"].bonus,
          persuasion:    skills["persuasion"].bonus,
          insight:       skills["insight"].bonus,
          investigation: skills["investigation"].bonus,
        },
      },
    };
  });

  // Build DM roll guides (monster actions)
  const dmRolls = activeCombat.combatants
    .filter((c) => c.type === "monster" && c.monsterSlug)
    .map((c) => {
      const monster = monsterMap[c.monsterSlug!];
      if (!monster) return null;

      const actions = (monster.actions as any[]).map((a: any) => ({
        name:        a.name,
        description: (a.desc ?? "").slice(0, 120),
        attackBonus: a.attack_bonus ?? null,
        damageDice:  a.damage?.[0]?.damage_dice ?? null,
        damageBonus: a.damage?.[0]?.damage_bonus ?? null,
        damageType:  a.damage?.[0]?.damage_type?.name ?? null,
        saveDc:      a.dc?.dc_value ?? null,
        saveType:    a.dc?.dc_type?.name ?? null,
      }));

      return {
        combatantId:  c.id,
        label:        c.label,
        monsterSlug:  c.monsterSlug,
        monsterName:  monster.name,
        currentHp:    c.currentHp,
        maxHp:        c.maxHp,
        armorClass:   c.armorClass,
        actions,
      };
    })
    .filter(Boolean);

  return {
    inCombat: true,
    round:    activeCombat.round,
    combatId: activeCombat.id,
    turnOrder: [...activeCombat.combatants]
      .sort((a, b) => b.initiative - a.initiative)
      .map((c) => ({
        id:         c.id,
        label:      c.label,
        type:       c.type,
        initiative: c.initiative,
        isAlive:    c.isAlive,
        currentHp:  c.currentHp,
        maxHp:      c.maxHp,
        conditions: c.conditions,
      })),
    playerRolls,
    dmRolls,
  };
}

// ── Helpers ───────────────────────────────────────────────────────
async function assertSessionExists(id: string) {
  const s = await prisma.session.findUnique({ where: { id }, select: { id: true } });
  if (!s) throw new NotFoundError("Session");
}
