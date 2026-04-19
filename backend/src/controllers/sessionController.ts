import { Request, Response } from "express";
import * as svc from "../services/sessionService";

export const listSessions = async (_req: Request, res: Response) =>
  res.json(await svc.listSessions());

export const createSession = async (req: Request, res: Response) =>
  res.status(201).json(await svc.createSession(req.body));

export const getSession = async (req: Request<{ id: string }>, res: Response) =>
  res.json(await svc.getSession(req.params.id));

export const updateSession = async (req: Request<{ id: string }>, res: Response) =>
  res.json(await svc.updateSession(req.params.id, req.body));

export const deleteSession = async (req: Request<{ id: string }>, res: Response) => {
  await svc.deleteSession(req.params.id);
  res.status(204).send();
};

export const addCharacter = async (req: Request<{ id: string }>, res: Response) => {
  const { characterId, playerName } = req.body as { characterId: string; playerName: string };
  res.json(await svc.addCharacterToSession(req.params.id, characterId, playerName));
};

export const removeCharacter = async (req: Request<{ id: string; characterId: string }>, res: Response) => {
  await svc.removeCharacterFromSession(req.params.id, req.params.characterId);
  res.status(204).send();
};

export const startCombat = async (req: Request<{ id: string }>, res: Response) => {
  const { name, combatants } = req.body as { name: string; combatants: any[] };
  res.status(201).json(await svc.startCombat(req.params.id, name, combatants));
};

export const appendCombatantsToCombat = async (
  req: Request<{ id: string; combatId: string }>,
  res: Response
) => {
  const { combatants } = req.body as { combatants: any[] };
  res.json(await svc.appendCombatantsToCombat(req.params.id, req.params.combatId, combatants ?? []));
};

export const getCombat = async (req: Request<{ id: string; combatId: string }>, res: Response) =>
  res.json(await svc.getCombat(req.params.combatId));

export const nextRound = async (req: Request<{ id: string; combatId: string }>, res: Response) =>
  res.json(await svc.nextRound(req.params.combatId));

export const nextTurn = async (req: Request<{ id: string; combatId: string }>, res: Response) =>
  res.json(await svc.nextTurn(req.params.combatId));

export const endCombat = async (req: Request<{ id: string; combatId: string }>, res: Response) =>
  res.json(await svc.endCombat(req.params.combatId));

export const updateCombatant = async (
  req: Request<{ id: string; combatId: string; combatantId: string }>,
  res: Response
) => res.json(await svc.updateCombatant(req.params.combatantId, req.body));

export const damageCombatant = async (
  req: Request<{ id: string; combatId: string; combatantId: string }>,
  res: Response
) => {
  const { amount } = req.body as { amount: number };
  res.json(await svc.damageCombatant(req.params.combatantId, amount));
};

export const healCombatant = async (
  req: Request<{ id: string; combatId: string; combatantId: string }>,
  res: Response
) => {
  const { amount } = req.body as { amount: number };
  res.json(await svc.healCombatant(req.params.combatantId, amount));
};

export const getRollSummary = async (req: Request<{ id: string }>, res: Response) =>
  res.json(await svc.getSessionRollSummary(req.params.id));

export const setSessionDungeon = async (req: Request<{ id: string }>, res: Response) => {
  const out = await svc.setSessionDungeonSnapshot(req.params.id, req.body);
  res.status(201).json(out);
};

export const getSessionDungeon = async (req: Request<{ id: string }>, res: Response) =>
  res.json(await svc.getSessionDungeonSnapshot(req.params.id));
