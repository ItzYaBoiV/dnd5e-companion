import { Router } from "express";
import * as ctrl from "../controllers/workerController";

export const workerRouter = Router();

workerRouter.get("/",              ctrl.listWorkers);    // health dashboard
workerRouter.post("/register",     ctrl.registerWorker); // workers call this
workerRouter.post("/reconcile",    ctrl.reconcileWorkers); // manual / same as auto job
workerRouter.delete("/:ip",        ctrl.removeWorker);   // remove a worker
