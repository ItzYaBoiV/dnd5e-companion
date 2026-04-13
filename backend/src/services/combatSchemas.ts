import { z } from "zod";

export const RollAttackSchema = z.object({
  weaponItemId: z.string().min(1),
  advantage: z.enum(["normal", "advantage", "disadvantage"]).default("normal"),
});

export const RollSaveSchema = z.object({
  ability: z.enum(["strength","dexterity","constitution","intelligence","wisdom","charisma"]),
  advantage: z.enum(["normal", "advantage", "disadvantage"]).default("normal"),
});

export const RollCheckSchema = z.object({
  skill: z.string().min(1),
  advantage: z.enum(["normal", "advantage", "disadvantage"]).default("normal"),
});
