import { Router } from "express";
import { validate } from "../middleware/validate";
import * as ctrl from "../controllers/combatController";
import { RollAttackSchema, RollSaveSchema, RollCheckSchema } from "../services/combatSchemas";

export const combatRouter = Router();

// These endpoints take a character ID and return computed roll info
// (what dice to roll, what bonus to add) — the client still rolls
// the dice (or can request a server-side roll).
combatRouter.post("/:id/roll/attack", validate("body", RollAttackSchema), ctrl.rollAttack);
combatRouter.post("/:id/roll/save", validate("body", RollSaveSchema), ctrl.rollSave);
combatRouter.post("/:id/roll/check", validate("body", RollCheckSchema), ctrl.rollCheck);
combatRouter.get("/:id/roll/initiative", ctrl.rollInitiative);
