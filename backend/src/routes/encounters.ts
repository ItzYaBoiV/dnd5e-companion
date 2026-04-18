import { Router } from "express";
import * as ctrl from "../controllers/encounterImportController";

export const encounterRouter = Router();

encounterRouter.post("/import-from-forge", ctrl.importFromForge);
