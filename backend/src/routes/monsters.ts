import { Router } from "express";
import * as ctrl from "../controllers/monsterController";

export const monsterRouter = Router();

monsterRouter.get("/",         ctrl.listMonsters);       // ?search=&type=&cr=&size=
monsterRouter.get("/by-cr",    ctrl.getMonstersByCr);   // ?crMin=0&crMax=5
monsterRouter.get("/:slug",    ctrl.getMonster);
monsterRouter.post("/encounter-difficulty", ctrl.encounterDifficulty);
