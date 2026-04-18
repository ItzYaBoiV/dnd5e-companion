import { Request, Response } from "express";
import * as svc from "../services/dungeonService";
import { getWorkerStatus, verifyLitellmRouterModel } from "../services/aiService";
import * as workerSvc from "../services/workerService";
import { sendLongRunningResult } from "../util/longRunningSse";
import * as jobSvc from "../services/generationJobService";
import { NotFoundError } from "../middleware/errorHandler";

export const listDungeons  = async (_req: Request, res: Response) => res.json(await svc.listDungeons());
export const getDungeon    = async (req: Request<{ id: string }>, res: Response) => res.json(await svc.getDungeon(req.params.id));
export const deleteDungeon = async (req: Request<{ id: string }>, res: Response) => { await svc.deleteDungeon(req.params.id); res.status(204).send(); };
export const listStories   = async (_req: Request, res: Response) => res.json(await svc.listStories());
export const getStory      = async (req: Request<{ id: string }>, res: Response) => res.json(await svc.getStory(req.params.id));
export const deleteStory   = async (req: Request<{ id: string }>, res: Response) => { await svc.deleteStory(req.params.id); res.status(204).send(); };

/** Dungeon + story run in the background so proxies never hold an open AI HTTP request. Client polls GET /jobs/:id then fetches the saved entity. */
export const generateDungeon = async (req: Request, res: Response) => {
  const job = await jobSvc.createGenerationJob("dungeon", req.body);
  jobSvc.startDungeonJob(job.id);
  res.status(202).json({
    jobId: job.id,
    pollPath: `/generate/jobs/${job.id}`,
    message: "Generation started. Poll pollPath until status is completed, then GET the dungeon by id from result.",
  });
};

/** Synchronous procedural floorplan (no worker / no LLM). */
export const saveForgeDungeon = async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const dungeon = await svc.saveForgeMapToLibrary({
    seed: Number(b.seed) || 0,
    locationType: typeof b.locationType === "string" ? b.locationType : "dungeon",
    levelMin: Math.min(20, Math.max(1, Number(b.levelMin) || 1)),
    levelMax: Math.min(20, Math.max(1, Number(b.levelMax) || 3)),
    mapName: typeof b.mapName === "string" ? b.mapName : "Forge map",
    rooms: Array.isArray(b.rooms) ? (b.rooms as Parameters<typeof svc.saveForgeMapToLibrary>[0]["rooms"]) : [],
    width: typeof b.width === "number" ? b.width : undefined,
    height: typeof b.height === "number" ? b.height : undefined,
  });
  res.status(201).json(dungeon);
};

export const generateProceduralDungeon = async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const theme = typeof b.theme === "string" && b.theme.trim() ? b.theme.trim() : "dungeon";
  const difficulty =
    typeof b.difficulty === "string" && b.difficulty.trim() ? b.difficulty.trim() : "medium";
  const levelMin = Math.min(20, Math.max(1, Number(b.levelMin) || 1));
  const levelMax = Math.min(20, Math.max(levelMin, Number(b.levelMax) || 3));
  const roomCount = Math.min(22, Math.max(4, Number(b.roomCount) || 8));
  const mapSeed =
    b.mapSeed !== undefined && b.mapSeed !== null && String(b.mapSeed).trim() !== ""
      ? (typeof b.mapSeed === "number" ? b.mapSeed : String(b.mapSeed).trim())
      : undefined;
  const dungeon = await svc.createProceduralDungeon({
    theme,
    difficulty,
    levelMin,
    levelMax,
    roomCount,
    mapSeed,
  });
  res.status(201).json(dungeon);
};

export const generateStory = async (req: Request, res: Response) => {
  const job = await jobSvc.createGenerationJob("story", req.body);
  jobSvc.startStoryJob(job.id);
  res.status(202).json({
    jobId: job.id,
    pollPath: `/generate/jobs/${job.id}`,
    message: "Generation started. Poll pollPath until status is completed, then GET the story by id from result.",
  });
};

export const getGenerationJob = async (req: Request<{ id: string }>, res: Response) => {
  const data = await jobSvc.getGenerationJob(req.params.id);
  if (!data) throw new NotFoundError("Job");
  res.json(data);
};

export const generateEncounter = async (req: Request, res: Response) => {
  await sendLongRunningResult(req, res, { successStatus: 200 }, () => svc.generateAiEncounter(req.body));
};

export const generateNpc = async (req: Request, res: Response) => {
  await sendLongRunningResult(req, res, { successStatus: 200 }, () => svc.generateAiNpc(req.body));
};

export const aiHealth = async (_req: Request, res: Response) => {
  const litellm = await verifyLitellmRouterModel();

  const registered = await workerSvc.getWorkerHealth();
  if (registered.length > 0) {
    const anyOnline = registered.some((w) => w.online);
    const ok = anyOnline && litellm.ok;
    res.json({
      ok,
      litellmRouteOk: litellm.ok,
      ...(litellm.ok ? {} : { litellmRouteDetail: litellm.detail }),
      workers: registered.map((w) => ({
        ip: w.ip,
        hostname: w.hostname,
        model: w.model,
        healthy: w.online,
        busy: false,
        responseMs: w.responseMs,
      })),
    });
    return;
  }

  const workers = await getWorkerStatus();
  const anyOnline = workers.some((w) => w.healthy);
  const ok = anyOnline && litellm.ok;
  res.json({
    ok,
    litellmRouteOk: litellm.ok,
    ...(litellm.ok ? {} : { litellmRouteDetail: litellm.detail }),
    workers: workers.map((w) => {
      let ip = "";
      try {
        ip = new URL(w.url).hostname;
      } catch {
        ip = w.url;
      }
      return {
        ip,
        hostname: null as string | null,
        model: w.model,
        healthy: w.healthy,
        busy: w.busy,
        responseMs: null as number | null,
      };
    }),
  });
};
