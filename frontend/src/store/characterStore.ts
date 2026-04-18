import { create } from "zustand";
import type { Character, CharacterDraft, HpChangeType, RestType } from "@/types/dnd";
import { DEFAULT_DRAFT } from "@/types/dnd";
import { characterApi, referenceApi } from "@/services/api";
import {
  getCreationSpellProfile,
  getMulticlassInitialSpellSegments,
  startingSpellsToPayload,
  validateStartingSpellPicks,
  type StartingSpellPick,
} from "@/lib/creationSpellGuide";
import {
  sortClassRowsForInitialCreate,
  validateCreationLevelUpsChain,
  validateMulticlassSteppedDraft,
} from "@/lib/multiclassLevelPlan";

interface CharacterStore {
  // Active character being viewed/played
  activeCharacter: Character | null;
  isLoading:       boolean;
  error:           string | null;

  // Character creation wizard
  draft: CharacterDraft;

  // Actions — each action is self-contained; stores don't call each other
  loadCharacter:  (id: string) => Promise<void>;
  clearCharacter: () => void;

  changeHp:       (type: HpChangeType, amount: number) => Promise<void>;
  recordDeathSave:(result: "success" | "failure", natural20?: boolean) => Promise<void>;
  stabilize:      () => Promise<void>;
  takeRest: (
    type: RestType,
    hitDiceToSpend?: number,
    hitDiceFrom?: { characterClassLevelId: string; amount: number }[],
  ) => Promise<void>;

  useSpellSlot:     (level: number) => Promise<void>;
  recoverSpellSlot: (level: number, amount?: number) => Promise<void>;

  addCondition:    (conditionSlug: string, notes?: string) => Promise<void>;
  removeCondition: (conditionId: string) => Promise<void>;

  addItem:    (body: unknown) => Promise<void>;
  updateItem: (itemId: string, body: unknown) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;

  addSpell:    (spellSlug: string, prepared?: boolean) => Promise<void>;
  updateSpell: (spellId: string, body: unknown) => Promise<void>;
  removeSpell: (spellId: string) => Promise<void>;

  updateCharacterField: (body: Record<string, unknown>) => Promise<void>;
  levelUp: (opts?: {
    hpIncrease?: number;
    classSlug?: string;
    subclassSlug?: string;
    grantFeatures?: { name: string; description?: string; source?: string }[];
    learnSpells?: { spellSlug: string; prepared?: boolean; alwaysPrepared?: boolean }[];
    abilityScoreImprovement?: { ability: string; increase: 1 | 2 }[];
  }) => Promise<void>;
  addFeature: (body: {
    name: string;
    description?: string;
    source?: string;
    uses?: number | null;
    usesMax?: number | null;
    recharge?: string | null;
  }) => Promise<void>;

  // Draft actions
  updateDraft:   (patch: Partial<CharacterDraft>) => void;
  resetDraft:    () => void;
  submitDraft:   () => Promise<Character>;
}

export const useCharacterStore = create<CharacterStore>((set, get) => ({
  activeCharacter: null,
  isLoading:       false,
  error:           null,
  draft:           { ...DEFAULT_DRAFT },

  // ── Load / Clear ─────────────────────────────────────────────
  loadCharacter: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const character = await characterApi.get(id);
      set({ activeCharacter: character, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  clearCharacter: () => set({ activeCharacter: null }),

  // ── HP helpers ───────────────────────────────────────────────
  changeHp: async (type, amount) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      const updated = await characterApi.changeHp(char.id, type, amount);
      set({ activeCharacter: updated });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  recordDeathSave: async (result, natural20 = false) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      const updated = await characterApi.recordDeathSave(char.id, result, natural20);
      set({ activeCharacter: updated });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  stabilize: async () => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      const updated = await characterApi.stabilize(char.id);
      set({ activeCharacter: updated });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  takeRest: async (type, hitDiceToSpend = 0, hitDiceFrom) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      const updated = await characterApi.rest(char.id, type, hitDiceToSpend, hitDiceFrom);
      set({ activeCharacter: updated });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  // ── Spell Slots ──────────────────────────────────────────────
  useSpellSlot: async (level) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      await characterApi.useSpellSlot(char.id, level);
      // Optimistic update
      set((state) => ({
        activeCharacter: state.activeCharacter
          ? {
              ...state.activeCharacter,
              spellSlots: state.activeCharacter.spellSlots.map((s) =>
                s.level === level ? { ...s, used: Math.min(s.total, s.used + 1) } : s
              ),
            }
          : null,
      }));
    } catch (err) {
      set({ error: String(err) });
      // Re-fetch to get accurate state
      await get().loadCharacter(char.id);
    }
  },

  recoverSpellSlot: async (level, amount = 1) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      await characterApi.recoverSpellSlot(char.id, level, amount);
      set((state) => ({
        activeCharacter: state.activeCharacter
          ? {
              ...state.activeCharacter,
              spellSlots: state.activeCharacter.spellSlots.map((s) =>
                s.level === level ? { ...s, used: Math.max(0, s.used - amount) } : s
              ),
            }
          : null,
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  // ── Conditions ───────────────────────────────────────────────
  addCondition: async (conditionSlug, notes = "") => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      await characterApi.addCondition(char.id, conditionSlug, notes);
      await get().loadCharacter(char.id);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  removeCondition: async (conditionId) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      await characterApi.removeCondition(char.id, conditionId);
      set((state) => ({
        activeCharacter: state.activeCharacter
          ? {
              ...state.activeCharacter,
              conditions: state.activeCharacter.conditions.filter((c) => c.id !== conditionId),
            }
          : null,
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  // ── Inventory ────────────────────────────────────────────────
  addItem: async (body) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      await characterApi.addItem(char.id, body);
      await get().loadCharacter(char.id);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  updateItem: async (itemId, body) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      await characterApi.updateItem(char.id, itemId, body);
      await get().loadCharacter(char.id);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  removeItem: async (itemId) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      await characterApi.removeItem(char.id, itemId);
      set((state) => ({
        activeCharacter: state.activeCharacter
          ? {
              ...state.activeCharacter,
              inventory: state.activeCharacter.inventory.filter((i) => i.id !== itemId),
            }
          : null,
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  // ── Spells ───────────────────────────────────────────────────
  addSpell: async (spellSlug, prepared = false) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      await characterApi.addSpell(char.id, spellSlug, prepared);
      await get().loadCharacter(char.id);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  updateSpell: async (spellId, body) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      await characterApi.updateSpell(char.id, spellId, body);
      await get().loadCharacter(char.id);
    } catch (err) {
      set({ error: String(err) });
    }
  },

  removeSpell: async (spellId) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      await characterApi.removeSpell(char.id, spellId);
      set((state) => ({
        activeCharacter: state.activeCharacter
          ? {
              ...state.activeCharacter,
              spells: state.activeCharacter.spells.filter((s) => s.id !== spellId),
            }
          : null,
      }));
    } catch (err) {
      set({ error: String(err) });
    }
  },

  // ── Generic field update ──────────────────────────────────────
  updateCharacterField: async (body) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      const updated = await characterApi.update(char.id, body);
      set({ activeCharacter: updated });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  levelUp: async (opts) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      const updated = await characterApi.levelUp(char.id, opts ?? {});
      set({ activeCharacter: updated, error: null });
    } catch (err) {
      const message = String(err);
      set({ error: message });
      throw err;
    }
  },

  addFeature: async (body) => {
    const char = get().activeCharacter;
    if (!char) return;
    try {
      const updated = await characterApi.addFeature(char.id, body);
      set({ activeCharacter: updated });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  // ── Draft ─────────────────────────────────────────────────────
  updateDraft: (patch) =>
    set((state) => ({ draft: { ...state.draft, ...patch } })),

  resetDraft: () => set({ draft: { ...DEFAULT_DRAFT } }),

  submitDraft: async () => {
    const draft = get().draft;

    const steppedAbove1 = draft.level > 1;
    const spellDraftForProfile =
      !draft.useMulticlass && steppedAbove1 ? { ...draft, level: 1 } : draft;

    const race = await referenceApi.race(draft.raceSlug).catch(() => undefined);
    const spellProfile = getCreationSpellProfile(spellDraftForProfile, race);

    let startingSpellsPayload: { spellSlug: string; prepared: boolean; alwaysPrepared: boolean }[] = [];
    if (draft.useMulticlass && steppedAbove1) {
      const mcErr = validateMulticlassSteppedDraft(draft);
      if (mcErr) throw new Error(mcErr);
      const mcInitial = getMulticlassInitialSpellSegments(draft, race);
      for (const { segmentKey, profile } of mcInitial) {
        const seg =
          draft.multiclassSpellSegments?.[segmentKey] ?? {
            cantripSlugs: [],
            leveledSlugs: [],
            wizardPreparedSlugs: [],
          };
        const leveled: StartingSpellPick[] = seg.leveledSlugs.map((slug) => ({
          spellSlug: slug,
          prepared:
            profile.mode === "prepared"
              ? true
              : profile.mode === "wizard"
                ? seg.wizardPreparedSlugs.includes(slug)
                : false,
        }));
        const val = validateStartingSpellPicks(profile, seg.cantripSlugs, leveled);
        if (!val.ok) throw new Error(`${profile.classSlug}: ${val.message}`);
        startingSpellsPayload.push(
          ...startingSpellsToPayload(profile, seg.cantripSlugs, leveled),
        );
      }
    } else if (!draft.useMulticlass && spellProfile) {
      const leveled: StartingSpellPick[] = (draft.startingLeveledSlugs ?? []).map((slug) => ({
        spellSlug: slug,
        prepared:
          spellProfile.mode === "prepared"
            ? true
            : spellProfile.mode === "wizard"
              ? (draft.startingWizardPreparedSlugs ?? []).includes(slug)
              : false,
      }));
      const val = validateStartingSpellPicks(spellProfile, draft.startingCantripSlugs ?? [], leveled);
      if (!val.ok) throw new Error(val.message);
      startingSpellsPayload = startingSpellsToPayload(
        spellProfile,
        draft.startingCantripSlugs ?? [],
        leveled,
      );
    }

    let classLevelsPayload:
      | { classSlug: string; subclassSlug?: string; levels: number; sortOrder: number }[]
      | undefined;
    let effectiveClassSlug = draft.classSlug;
    let effectiveSubclass: string | null | undefined = draft.subclassSlug;

    if (draft.useMulticlass && draft.classLevels.length > 0) {
      if (steppedAbove1) {
        const firstSlug = (draft.multiclassFirstClassSlug ?? "").trim();
        const sorted = sortClassRowsForInitialCreate(draft.classLevels, firstSlug);
        classLevelsPayload = sorted.map((row, i) => ({
          classSlug: row.classSlug,
          subclassSlug: row.subclassSlug?.trim() || undefined,
          levels: row.classSlug.trim() === firstSlug ? 1 : 0,
          sortOrder: i,
        }));
        effectiveClassSlug = sorted[0]?.classSlug?.trim() || draft.classSlug;
        effectiveSubclass = sorted[0]?.subclassSlug?.trim() || undefined;
      } else {
        classLevelsPayload = draft.classLevels.map((row, i) => ({
          classSlug: row.classSlug,
          subclassSlug: row.subclassSlug?.trim() || undefined,
          levels: row.levels,
          sortOrder: i,
        }));
        effectiveClassSlug = draft.classLevels[0]?.classSlug?.trim() || draft.classSlug;
        effectiveSubclass = draft.classLevels[0]?.subclassSlug?.trim() || draft.subclassSlug;
      }
    }

    if (steppedAbove1) {
      const chainErr = validateCreationLevelUpsChain(draft);
      if (chainErr) throw new Error(chainErr);
    }

    const payload = {
      name:           draft.name,
      raceSlug:       draft.raceSlug,
      subraceSlug:    draft.subraceSlug || undefined,
      classSlug:      effectiveClassSlug,
      subclassSlug:   effectiveSubclass || undefined,
      ...(classLevelsPayload ? { classLevels: classLevelsPayload } : {}),
      backgroundSlug: draft.backgroundSlug,
      alignment:      draft.alignment,
      level:          steppedAbove1 ? 1 : draft.level,
      ...draft.scores,
      maxHp:          0,  // Server will compute based on class hit die
      speed:          30, // Server fills from race; overridable
      savingThrowProficiencies: draft.savingThrows,
      skillProficiencies:       draft.chosenSkills,
      ...(!draft.useMulticlass && draft.spellcastingAbility && { spellcastingAbility: draft.spellcastingAbility }),
      skillExpertise:           [],
      weaponProficiencies:      [],
      armorProficiencies:       [],
      toolProficiencies:        [],
      languages:                [],
      personalityTraits: draft.personalityTraits,
      ideals:            draft.ideals,
      bonds:             draft.bonds,
      flaws:             draft.flaws,
      backstory:         draft.backstory,
      startingInventory: (draft.startingInventoryDraft ?? [])
        .filter(
          (row) =>
            (row.itemSlug != null && row.itemSlug.trim() !== "") ||
            (row.customName != null && row.customName.trim() !== ""),
        )
        .map((row) => ({
          itemSlug: row.itemSlug?.trim() || undefined,
          customName: row.customName?.trim() || undefined,
          quantity: row.quantity,
          notes: "",
          equipped: row.equipped ?? false,
        })),
      startingSpells: startingSpellsPayload,
    };

    const character = await characterApi.create(payload);

    if (steppedAbove1) {
      let c = character;
      const ups = draft.creationLevelUps ?? [];
      type LevelUpBody = NonNullable<Parameters<typeof characterApi.levelUp>[1]>;
      for (let i = 0; i < ups.length; i++) {
        const raw = ups[i];
        if (!raw) {
          throw new Error(`Missing level-up payload for step ${i + 1}.`);
        }
        const lu: LevelUpBody = { ...raw };
        if (draft.useMulticlass) {
          const slug = draft.multiclassLevelOrder[i];
          if (!slug?.trim()) {
            throw new Error(`Missing multiclass class choice for character level ${i + 2}.`);
          }
          lu.classSlug = slug.trim();
        } else {
          delete lu.classSlug;
        }
        c = await characterApi.levelUp(c.id, lu);
      }
      set({ activeCharacter: c });
      get().resetDraft();
      return c;
    }

    set({ activeCharacter: character });
    get().resetDraft();
    return character;
  },
}));
