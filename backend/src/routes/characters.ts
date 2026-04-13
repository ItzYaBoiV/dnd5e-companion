import { Router } from "express";
import { validate } from "../middleware/validate";
import * as ctrl from "../controllers/characterController";
import {
  CreateCharacterSchema,
  UpdateCharacterSchema,
  HpChangeSchema,
  DeathSaveSchema,
  RestSchema,
  SpellSlotSchema,
  AddConditionSchema,
  AddInventorySchema,
  UpdateInventorySchema,
  AddSpellSchema,
  UpdateSpellSchema,
  LevelUpSchema,
  AddFeatureSchema,
} from "../services/characterSchemas";

export const characterRouter = Router();

// ── Character CRUD ────────────────────────────────────────
characterRouter.get("/", ctrl.listCharacters);
characterRouter.post("/", validate("body", CreateCharacterSchema), ctrl.createCharacter);
characterRouter.get("/:id", ctrl.getCharacter);
characterRouter.patch("/:id", validate("body", UpdateCharacterSchema), ctrl.updateCharacter);
characterRouter.post("/:id/level-up", validate("body", LevelUpSchema), ctrl.levelUpCharacter);
characterRouter.delete("/:id", ctrl.deleteCharacter);

// ── HP & Death Saves ──────────────────────────────────────
characterRouter.post("/:id/hp", validate("body", HpChangeSchema), ctrl.changeHp);
characterRouter.post("/:id/death-save", validate("body", DeathSaveSchema), ctrl.recordDeathSave);
characterRouter.post("/:id/stabilize", ctrl.stabilize);

// ── Rest ──────────────────────────────────────────────────
characterRouter.post("/:id/rest", validate("body", RestSchema), ctrl.takeRest);

// ── Spell Slots ───────────────────────────────────────────
characterRouter.patch("/:id/spell-slots/:level", validate("body", SpellSlotSchema), ctrl.updateSpellSlot);

// ── Conditions ────────────────────────────────────────────
characterRouter.post("/:id/conditions", validate("body", AddConditionSchema), ctrl.addCondition);
characterRouter.delete("/:id/conditions/:conditionId", ctrl.removeCondition);

// ── Inventory ─────────────────────────────────────────────
characterRouter.post("/:id/inventory", validate("body", AddInventorySchema), ctrl.addInventoryItem);
characterRouter.patch("/:id/inventory/:itemId", validate("body", UpdateInventorySchema), ctrl.updateInventoryItem);
characterRouter.delete("/:id/inventory/:itemId", ctrl.removeInventoryItem);

// ── Spells ────────────────────────────────────────────────
characterRouter.post("/:id/spells", validate("body", AddSpellSchema), ctrl.addSpell);
characterRouter.patch("/:id/spells/:spellId", validate("body", UpdateSpellSchema), ctrl.updateSpell);
characterRouter.delete("/:id/spells/:spellId", ctrl.removeSpell);

characterRouter.post("/:id/features", validate("body", AddFeatureSchema), ctrl.addCharacterFeature);
