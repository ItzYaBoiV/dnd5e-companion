import { Router } from "express";
import * as ctrl from "../controllers/displayController";

export const displayRouter = Router();

displayRouter.get("/", ctrl.listDisplays);
displayRouter.patch("/:tvId", ctrl.renameDisplay);
displayRouter.post("/:tvId/player-map", ctrl.setDisplayMap);
displayRouter.get("/:tvId/player-map", ctrl.getDisplayMap);
displayRouter.get("/:tvId/player-map/stream", ctrl.streamDisplayMap);
