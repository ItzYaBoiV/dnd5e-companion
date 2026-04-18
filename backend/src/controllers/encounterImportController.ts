import type { Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import * as monsterSvc from "../services/monsterService";
import * as sessionSvc from "../services/sessionService";

const monsterZ = z.object({
  slug: z.string().min(1),
  name: z.string(),
  count: z.number().int().positive(),
  cr: z.number(),
  hpRoll: z.number().optional(),
});

const encounterZ = z.object({
  roomId: z.number().int(),
  difficulty: z.enum(["easy", "medium", "hard", "deadly"]),
  xpBudget: z.number(),
  monsters: z.array(monsterZ),
});

const forgeImportV2 = z.object({
  v: z.literal(2),
  source: z.string(),
  savedAt: z.string(),
  seed: z.number(),
  locationType: z.string(),
  level: z.number().int(),
  rooms: z.array(
    z.object({
      id: z.number().int(),
      name: z.string().optional(),
      theme: z.string().optional(),
      depth: z.number().optional(),
      shape: z.string().optional(),
      boundingBox: z
        .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
        .optional(),
    }),
  ),
  encounters: z.array(encounterZ),
  treasure: z.array(z.unknown()).optional(),
  traps: z.array(z.unknown()).optional(),
  notes: z.string().optional(),
  sessionId: z.string().optional(),
});

/**
 * Validates a Dungeon Forge v2 encounter export. When `sessionId` is present,
 * creates one Combat per encounter with monster combatants resolved from SRD slugs.
 */
export const importFromForge = async (req: Request, res: Response) => {
  const parsed = forgeImportV2.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid forge import payload",
      details: parsed.error.flatten(),
    });
    return;
  }
  const data = parsed.data;
  const createdEncounterIds: string[] = [];

  if (data.sessionId) {
    for (const enc of data.encounters) {
      if (enc.monsters.length === 0) continue;
      const combatants: sessionSvc.CombatantInput[] = [];
      let labelSeq = 1;
      for (const m of enc.monsters) {
        let mon;
        try {
          mon = await monsterSvc.getMonster(m.slug);
        } catch {
          throw new AppError(400, `Unknown monster slug: ${m.slug}`, "FORGE_UNKNOWN_MONSTER");
        }
        for (let k = 0; k < m.count; k++) {
          combatants.push({
            type: "monster",
            monsterSlug: m.slug,
            label: `${mon.name} ${labelSeq++}`,
            initiative: 0,
            maxHp: mon.hitPoints,
            armorClass: mon.armorClass,
          });
        }
      }
      if (combatants.length === 0) continue;
      const combat = await sessionSvc.startCombat(
        data.sessionId,
        `Forge — room ${enc.roomId} (${data.locationType})`,
        combatants,
      );
      createdEncounterIds.push(combat.id);
    }
  }

  res.json({ ok: true, createdEncounterIds, echo: { encounterCount: data.encounters.length } });
};
