import { prisma } from "../config/database";
import { AppError, NotFoundError } from "../middleware/errorHandler";
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

/** Add monsters (or other combatants) to an in-progress fight without ending it. */
export async function appendCombatantsToCombat(
  sessionId: string,
  combatId: string,
  combatants: CombatantInput[]
) {
  const combat = await prisma.combat.findFirst({
    where: { id: combatId, sessionId },
    select: { id: true, status: true },
  });
  if (!combat) throw new NotFoundError("Combat");
  if (combat.status !== "active") {
    throw new AppError(400, "Only active combats accept new combatants", "COMBAT_NOT_ACTIVE");
  }
  if (combatants.length === 0) return getCombat(combatId);

  await prisma.combatant.createMany({
    data: combatants.map((c) => ({
      combatId,
      type: c.type,
      characterId: c.characterId ?? null,
      monsterSlug: c.monsterSlug ?? null,
      label: c.label,
      initiative: c.initiative,
      currentHp: c.maxHp,
      maxHp: c.maxHp,
      temporaryHp: 0,
      armorClass: c.armorClass,
      conditions: [],
      isConcentrating: false,
      isAlive: true,
      notes: "",
    })),
  });

  return getCombat(combatId);
}

export async function startCombat(sessionId: string, name: string, combatants: CombatantInput[]) {
  await assertSessionExists(sessionId);
  // Only one active combat per session — close strays so the client never binds to an old fight.
  await prisma.combat.updateMany({
    where: { sessionId, status: "active" },
    data: { status: "completed" },
  });
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

export async function nextTurn(combatId: string) {
  const c = await prisma.combat.findUnique({
    where: { id: combatId },
    include: { combatants: true },
  });
  if (!c) throw new NotFoundError("Combat");
  const alive = [...c.combatants]
    .filter((x) => x.isAlive)
    .sort((a, b) => b.initiative - a.initiative);
  const next = ((c.currentTurnIndex ?? 0) + 1) % Math.max(1, alive.length);
  const newRound = next === 0;
  await prisma.combat.update({
    where: { id: combatId },
    data: {
      currentTurnIndex: next,
      ...(newRound ? { round: { increment: 1 } } : {}),
    },
  });
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
    data:  { currentHp, temporaryHp },
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
        orderBy: { createdAt: "desc" },
        take:    1,
        include: { combatants: { where: { isAlive: true } } },
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

    const meleeMod = Math.max(mods.strength, mods.dexterity);
    const meleeLabel = mods.dexterity > mods.strength ? "DEX/finesse melee" : "STR melee";

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
          melee:  { bonus: meleeMod + profB, label: meleeLabel },
          ranged: { bonus: mods.dexterity + profB, label: "DEX ranged" },
          spell:  spellBonus !== null
            ? { bonus: spellBonus, dc: 8 + spellBonus, label: `${char.spellcastingAbility?.slice(0,3).toUpperCase()} spell` }
            : null,
        },
        saves: {
          strength:     { bonus: saves.strength.bonus,     proficient: saves.strength.proficient },
          dexterity:    { bonus: saves.dexterity.bonus,    proficient: saves.dexterity.proficient },
          constitution: { bonus: saves.constitution.bonus, proficient: saves.constitution.proficient },
          intelligence: { bonus: saves.intelligence.bonus, proficient: saves.intelligence.proficient },
          wisdom:       { bonus: saves.wisdom.bonus,       proficient: saves.wisdom.proficient },
          charisma:     { bonus: saves.charisma.bonus,     proficient: saves.charisma.proficient },
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
      const slug = c.monsterSlug!;
      const monster = monsterMap[slug];

      const mapActionRow = (a: any) => {
        const dmg0 = Array.isArray(a?.damage) && a.damage[0] ? a.damage[0] : null;
        const damageDice =
          dmg0?.damage_dice ?? a?.damage_dice ?? null;
        const damageBonus =
          dmg0?.damage_bonus ?? a?.damage_bonus ?? null;
        const damageType =
          dmg0?.damage_type?.name ?? a?.damage_type?.name ?? (typeof a?.damage_type === "string" ? a.damage_type : null) ?? null;
        return {
          name:        a?.name ?? "Action",
          description: String(a?.desc ?? "").slice(0, 500),
          attackBonus: a?.attack_bonus ?? null,
          damageDice,
          damageBonus,
          damageType,
          saveDc:   a?.dc?.dc_value ?? null,
          saveType: a?.dc?.dc_type?.name ?? null,
        };
      };

      const actionsFromJson = (raw: unknown) => {
        if (!Array.isArray(raw)) return [];
        return raw.map(mapActionRow);
      };

      if (!monster) {
        return {
          combatantId: c.id,
          label:       c.label,
          monsterSlug: slug,
          monsterName: c.label.replace(/\s+\d+$/, "").trim() || slug,
          currentHp:   c.currentHp,
          maxHp:       c.maxHp,
          armorClass:  c.armorClass,
          actions: [
            {
              name:        "Stat block not in database",
              description: `Slug “${slug}” — open Monsters or use the tracker HP/AC.`,
              attackBonus: null,
              damageDice:  null,
              damageBonus: null,
              damageType:  null,
              saveDc:      null,
              saveType:    null,
            },
          ],
          legendaryActions: [],
          legendaryActionPoints: 3,
        };
      }

      const actionsRaw = monster.actions;
      let actions = actionsFromJson(actionsRaw);
      if (actions.length === 0 && monster.specialAbilities != null) {
        actions = actionsFromJson(monster.specialAbilities);
      }
      if (actions.length === 0) {
        actions = [
          {
            name:        "See stat block",
            description: "Actions in DB are not in array form — use Monsters page or the book.",
            attackBonus: null,
            damageDice:  null,
            damageBonus: null,
            damageType:  null,
            saveDc:      null,
            saveType:    null,
          },
        ];
      }

      const legendaryActions = monster.legendaryActions
        ? actionsFromJson(monster.legendaryActions)
        : [];

      return {
        combatantId:  c.id,
        label:        c.label,
        monsterSlug:  slug,
        monsterName:  monster.name,
        currentHp:    c.currentHp,
        maxHp:        c.maxHp,
        armorClass:   c.armorClass,
        actions,
        legendaryActions,
        legendaryActionPoints: 3,
      };
    });

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

export async function setSessionDungeonSnapshot(sessionId: string, snapshot: unknown) {
  await assertSessionExists(sessionId);
  return prisma.session.update({
    where: { id: sessionId },
    data: { dungeonSnapshot: JSON.stringify(snapshot ?? null) },
    select: { id: true, dungeonSnapshot: true, updatedAt: true },
  });
}

export async function getSessionDungeonSnapshot(sessionId: string) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, dungeonSnapshot: true },
  });
  if (!session) throw new NotFoundError("Session");
  if (!session.dungeonSnapshot) return null;
  try {
    return JSON.parse(session.dungeonSnapshot);
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────
async function assertSessionExists(id: string) {
  const s = await prisma.session.findUnique({ where: { id }, select: { id: true } });
  if (!s) throw new NotFoundError("Session");
}
