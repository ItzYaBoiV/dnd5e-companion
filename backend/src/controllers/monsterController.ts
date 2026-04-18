import { Request, Response } from "express";
import * as svc from "../services/monsterService";

export const listMonsters = async (req: Request, res: Response) => {
  res.json(await svc.listMonsters({
    search: req.query.search as string | undefined,
    type:   req.query.type   as string | undefined,
    cr:     req.query.cr     as string | undefined,
    size:   req.query.size   as string | undefined,
  }));
};

export const getMonster = async (req: Request<{ slug: string }>, res: Response) => {
  res.json(await svc.getMonster(req.params.slug));
};

export const getMonstersByCr = async (req: Request, res: Response) => {
  const crMin = parseFloat(req.query.crMin as string ?? "0");
  const crMax = parseFloat(req.query.crMax as string ?? "30");
  res.json(await svc.getMonstersByCr(crMin, crMax));
};

export const resolveMonstersByNames = async (req: Request, res: Response) => {
  const names = (req.body as { names?: unknown })?.names;
  if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) {
    res.status(400).json({ error: "Body must be { names: string[] }" });
    return;
  }
  res.json(await svc.resolveMonstersByNames(names as string[]));
};

export const encounterDifficulty = async (req: Request, res: Response) => {
  const { partyLevels, monsterXpValues } = req.body as {
    partyLevels: number[];
    monsterXpValues: number[];
  };
  res.json(svc.encounterDifficulty(partyLevels, monsterXpValues));
};
