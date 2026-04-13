import { Request, Response } from "express";
import * as svc from "../services/characterService";
import {
  CreateCharacterInput,
  UpdateCharacterInput,
  HpChangeInput,
  DeathSaveInput,
  RestInput,
  AddConditionInput,
  AddInventoryInput,
  UpdateInventoryInput,
  AddSpellInput,
  UpdateSpellInput,
  LevelUpInput,
  AddFeatureInput,
} from "../services/characterSchemas";

export const listCharacters = async (_req: Request, res: Response) => {
  const characters = await svc.listCharacters();
  res.json(characters);
};

export const createCharacter = async (req: Request<{}, {}, CreateCharacterInput>, res: Response) => {
  const character = await svc.createCharacter(req.body);
  res.status(201).json(character);
};

export const getCharacter = async (req: Request<{ id: string }>, res: Response) => {
  const character = await svc.getCharacter(req.params.id);
  res.json(character);
};

export const updateCharacter = async (req: Request<{ id: string }, {}, UpdateCharacterInput>, res: Response) => {
  const character = await svc.updateCharacter(req.params.id, req.body);
  res.json(character);
};

export const levelUpCharacter = async (req: Request<{ id: string }, {}, LevelUpInput>, res: Response) => {
  const character = await svc.levelUpCharacter(req.params.id, req.body);
  res.json(character);
};

export const deleteCharacter = async (req: Request<{ id: string }>, res: Response) => {
  await svc.deleteCharacter(req.params.id);
  res.status(204).send();
};

export const changeHp = async (req: Request<{ id: string }, {}, HpChangeInput>, res: Response) => {
  const character = await svc.changeHp(req.params.id, req.body);
  res.json(character);
};

export const recordDeathSave = async (req: Request<{ id: string }, {}, DeathSaveInput>, res: Response) => {
  const result = await svc.recordDeathSave(req.params.id, req.body);
  res.json(result);
};

export const stabilize = async (req: Request<{ id: string }>, res: Response) => {
  const character = await svc.stabilize(req.params.id);
  res.json(character);
};

export const takeRest = async (req: Request<{ id: string }, {}, RestInput>, res: Response) => {
  const result = await svc.takeRest(req.params.id, req.body);
  res.json(result);
};

export const updateSpellSlot = async (req: Request<{ id: string; level: string }>, res: Response) => {
  const { action, amount } = req.body as { action: string; amount: number };
  const result = await svc.updateSpellSlot(req.params.id, parseInt(req.params.level, 10), action, amount ?? 1);
  res.json(result);
};

export const addCondition = async (req: Request<{ id: string }, {}, AddConditionInput>, res: Response) => {
  const condition = await svc.addCondition(req.params.id, req.body);
  res.status(201).json(condition);
};

export const removeCondition = async (req: Request<{ id: string; conditionId: string }>, res: Response) => {
  await svc.removeCondition(req.params.id, req.params.conditionId);
  res.status(204).send();
};

export const addInventoryItem = async (req: Request<{ id: string }, {}, AddInventoryInput>, res: Response) => {
  const item = await svc.addInventoryItem(req.params.id, req.body);
  res.status(201).json(item);
};

export const updateInventoryItem = async (req: Request<{ id: string; itemId: string }, {}, UpdateInventoryInput>, res: Response) => {
  const item = await svc.updateInventoryItem(req.params.id, req.params.itemId, req.body);
  res.json(item);
};

export const removeInventoryItem = async (req: Request<{ id: string; itemId: string }>, res: Response) => {
  await svc.removeInventoryItem(req.params.id, req.params.itemId);
  res.status(204).send();
};

export const addSpell = async (req: Request<{ id: string }, {}, AddSpellInput>, res: Response) => {
  const spell = await svc.addSpell(req.params.id, req.body);
  res.status(201).json(spell);
};

export const updateSpell = async (req: Request<{ id: string; spellId: string }, {}, UpdateSpellInput>, res: Response) => {
  const spell = await svc.updateSpell(req.params.id, req.params.spellId, req.body);
  res.json(spell);
};

export const removeSpell = async (req: Request<{ id: string; spellId: string }>, res: Response) => {
  await svc.removeSpell(req.params.id, req.params.spellId);
  res.status(204).send();
};

export const addCharacterFeature = async (req: Request<{ id: string }, {}, AddFeatureInput>, res: Response) => {
  const character = await svc.addCharacterFeature(req.params.id, req.body);
  res.status(201).json(character);
};
