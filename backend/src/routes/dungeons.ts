import { Router } from "express";
import * as ctrl from "../controllers/dungeonController";
export const dungeonRouter = Router();

dungeonRouter.get("/ai/health",           ctrl.aiHealth);
dungeonRouter.get("/jobs/:id",            ctrl.getGenerationJob);
dungeonRouter.get("/dungeons",            ctrl.listDungeons);
dungeonRouter.post("/dungeons/generate",            ctrl.generateDungeon);
dungeonRouter.post("/dungeons/generate-procedural", ctrl.generateProceduralDungeon);
dungeonRouter.post("/dungeons/save-forge", ctrl.saveForgeDungeon);
dungeonRouter.get("/dungeons/:id",        ctrl.getDungeon);
dungeonRouter.delete("/dungeons/:id",     ctrl.deleteDungeon);
dungeonRouter.get("/stories",             ctrl.listStories);
dungeonRouter.post("/stories/generate",   ctrl.generateStory);
dungeonRouter.get("/stories/:id",         ctrl.getStory);
dungeonRouter.delete("/stories/:id",      ctrl.deleteStory);
dungeonRouter.post("/encounter/generate", ctrl.generateEncounter);
dungeonRouter.post("/npc/generate",       ctrl.generateNpc);
