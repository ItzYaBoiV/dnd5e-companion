import { Request, Response } from "express";
import * as svc from "../services/referenceService";
import { NotFoundError } from "../middleware/errorHandler";

export const getRaces      = async (_req: Request, res: Response) => res.json(await svc.getRaces());
export const getClasses    = async (_req: Request, res: Response) => res.json(await svc.getClasses());
export const getBackgrounds= async (_req: Request, res: Response) => res.json(await svc.getBackgrounds());
export const getFeats      = async (_req: Request, res: Response) => res.json(await svc.getFeats());
export const getConditions = async (_req: Request, res: Response) => res.json(await svc.getConditions());

export const getRace = async (req: Request<{ slug: string }>, res: Response) => {
  const data = await svc.getRace(req.params.slug);
  if (!data) throw new NotFoundError("Race");
  res.json(data);
};

export const getClass = async (req: Request<{ slug: string }>, res: Response) => {
  const data = await svc.getClass(req.params.slug);
  if (!data) throw new NotFoundError("Class");
  res.json(data);
};

export const getBackground = async (req: Request<{ slug: string }>, res: Response) => {
  const data = await svc.getBackground(req.params.slug);
  if (!data) throw new NotFoundError("Background");
  res.json(data);
};

export const getSpells = async (req: Request, res: Response) => {
  const spells = await svc.getSpells({
    classSlug:     req.query.class as string | undefined,
    level:         req.query.level as string | undefined,
    school:        req.query.school as string | undefined,
    search:        req.query.search as string | undefined,
    ritual:        req.query.ritual as string | undefined,
    concentration: req.query.concentration as string | undefined,
  });
  res.json(spells);
};

export const getSpell = async (req: Request<{ slug: string }>, res: Response) => {
  const data = await svc.getSpell(req.params.slug);
  if (!data) throw new NotFoundError("Spell");
  res.json(data);
};

export const getItems = async (req: Request, res: Response) => {
  const items = await svc.getItems({
    category:    req.query.category as string | undefined,
    subcategory: req.query.subcategory as string | undefined,
    search:      req.query.search as string | undefined,
    magical:     req.query.magical as string | undefined,
  });
  res.json(items);
};

export const getItem = async (req: Request<{ slug: string }>, res: Response) => {
  const data = await svc.getItem(req.params.slug);
  if (!data) throw new NotFoundError("Item");
  res.json(data);
};

export const getFeat = async (req: Request<{ slug: string }>, res: Response) => {
  const data = await svc.getFeat(req.params.slug);
  if (!data) throw new NotFoundError("Feat");
  res.json(data);
};

export const getCondition = async (req: Request<{ slug: string }>, res: Response) => {
  const data = await svc.getCondition(req.params.slug);
  if (!data) throw new NotFoundError("Condition");
  res.json(data);
};
