import { Router } from "express";
import * as ctrl from "../controllers/referenceController";

export const referenceRouter = Router();

// All reference routes are GET-only — SRD data is read-only at runtime.
referenceRouter.get("/races", ctrl.getRaces);
referenceRouter.get("/races/:slug", ctrl.getRace);

referenceRouter.get("/classes", ctrl.getClasses);
referenceRouter.get("/classes/:slug", ctrl.getClass);

referenceRouter.get("/backgrounds", ctrl.getBackgrounds);
referenceRouter.get("/backgrounds/:slug", ctrl.getBackground);

referenceRouter.get("/spells", ctrl.getSpells);      // supports ?class=&level=&school=&search=
referenceRouter.get("/spells/:slug", ctrl.getSpell);

referenceRouter.get("/items", ctrl.getItems);        // supports ?category=&subcategory=&search=
referenceRouter.get("/items/:slug", ctrl.getItem);

referenceRouter.get("/feats", ctrl.getFeats);
referenceRouter.get("/feats/:slug", ctrl.getFeat);

referenceRouter.get("/conditions", ctrl.getConditions);
referenceRouter.get("/conditions/:slug", ctrl.getCondition);
