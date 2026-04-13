import { Router } from "express";
import { characterRouter } from "./characters";
import { referenceRouter } from "./reference";
import { combatRouter }    from "./combat";
import { monsterRouter }   from "./monsters";
import { dungeonRouter }   from "./dungeons";
import { sessionRouter }   from "./sessions";
import { workerRouter }    from "./workers";

export const router = Router();

router.use("/characters", characterRouter);
router.use("/reference",  referenceRouter);
router.use("/combat",     combatRouter);
router.use("/monsters",   monsterRouter);
router.use("/generate",   dungeonRouter);
router.use("/sessions",   sessionRouter);
router.use("/workers",    workerRouter);   // AI worker registration — no SSH needed

router.use((_req, res) => {
  res.status(404).json({ error: "API endpoint not found", code: "NOT_FOUND" });
});
