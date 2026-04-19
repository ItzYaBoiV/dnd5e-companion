import { Router } from "express";
import * as ctrl from "../controllers/sessionController";

export const sessionRouter = Router();

// Sessions
sessionRouter.get("/",    ctrl.listSessions);
sessionRouter.post("/",   ctrl.createSession);
sessionRouter.get("/:id", ctrl.getSession);
sessionRouter.patch("/:id", ctrl.updateSession);
sessionRouter.delete("/:id", ctrl.deleteSession);

// Party management
sessionRouter.post("/:id/characters",                ctrl.addCharacter);
sessionRouter.delete("/:id/characters/:characterId", ctrl.removeCharacter);

// Roll summary for DM helper
sessionRouter.get("/:id/rolls", ctrl.getRollSummary);
sessionRouter.post("/:id/dungeon", ctrl.setSessionDungeon);
sessionRouter.get("/:id/dungeon", ctrl.getSessionDungeon);

// Combat
sessionRouter.post("/:id/combats",                                        ctrl.startCombat);
sessionRouter.post("/:id/combats/:combatId/append-combatants",            ctrl.appendCombatantsToCombat);
sessionRouter.get("/:id/combats/:combatId",                               ctrl.getCombat);
sessionRouter.post("/:id/combats/:combatId/next-round",                   ctrl.nextRound);
sessionRouter.post("/:id/combats/:combatId/next-turn",                    ctrl.nextTurn);
sessionRouter.post("/:id/combats/:combatId/end",                          ctrl.endCombat);
sessionRouter.patch("/:id/combats/:combatId/combatants/:combatantId",     ctrl.updateCombatant);
sessionRouter.post("/:id/combats/:combatId/combatants/:combatantId/damage", ctrl.damageCombatant);
sessionRouter.post("/:id/combats/:combatId/combatants/:combatantId/heal",   ctrl.healCombatant);
