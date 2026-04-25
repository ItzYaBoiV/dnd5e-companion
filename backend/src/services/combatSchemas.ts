import { z } from "zod";

export const RollAttackSchema = z.object({
  weaponItemId: z.string().min(1),
  advantage: z.enum(["normal", "advantage", "disadvantage"]).default("normal"),
});

export const RollSaveSchema = z.object({
  ability: z.enum(["strength","dexterity","constitution","intelligence","wisdom","charisma"]),
  advantage: z.enum(["normal", "advantage", "disadvantage"]).default("normal"),
  /** When rolling with advantage/disadvantage after a normal d20, reuse this as the first d20 (second is rolled server-side). */
  priorD20: z.number().int().min(1).max(20).optional(),
});

export const RollCheckSchema = z.object({
  skill: z.string().min(1),
  advantage: z.enum(["normal", "advantage", "disadvantage"]).default("normal"),
  priorD20: z.number().int().min(1).max(20).optional(),
});
