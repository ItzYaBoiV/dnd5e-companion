import { create } from "zustand";
import type { Race, DndClass, Background, Spell, Item, Feat, Condition } from "@/types/dnd";
import { referenceApi } from "@/services/api";

interface ReferenceStore {
  races:       Race[];
  classes:     DndClass[];
  backgrounds: Background[];
  conditions:  Condition[];
  feats:       Feat[];
  spells:      Spell[];
  items:       Item[];
  loaded:      Record<string, boolean>;
  loading:     Record<string, boolean>;

  loadRaces:       () => Promise<void>;
  loadClasses:     () => Promise<void>;
  loadBackgrounds: () => Promise<void>;
  loadConditions:  () => Promise<void>;
  loadFeats:       () => Promise<void>;
  loadSpells:      (filters?: Parameters<typeof referenceApi.spells>[0]) => Promise<void>;
  loadItems:       (filters?: Parameters<typeof referenceApi.items>[0]) => Promise<void>;
}

export const useReferenceStore = create<ReferenceStore>((set, get) => ({
  races: [], classes: [], backgrounds: [], conditions: [],
  feats: [], spells: [], items: [],
  loaded: {}, loading: {},

  loadRaces: async () => {
    if (get().loaded["races"] || get().loading["races"]) return;
    set((s) => ({ loading: { ...s.loading, races: true } }));
    const races = await referenceApi.races();
    set((s) => ({ races, loaded: { ...s.loaded, races: true }, loading: { ...s.loading, races: false } }));
  },

  loadClasses: async () => {
    if (get().loaded["classes"] || get().loading["classes"]) return;
    set((s) => ({ loading: { ...s.loading, classes: true } }));
    const classes = await referenceApi.classes();
    set((s) => ({ classes, loaded: { ...s.loaded, classes: true }, loading: { ...s.loading, classes: false } }));
  },

  loadBackgrounds: async () => {
    if (get().loaded["backgrounds"] || get().loading["backgrounds"]) return;
    set((s) => ({ loading: { ...s.loading, backgrounds: true } }));
    const backgrounds = await referenceApi.backgrounds();
    set((s) => ({ backgrounds, loaded: { ...s.loaded, backgrounds: true }, loading: { ...s.loading, backgrounds: false } }));
  },

  loadConditions: async () => {
    if (get().loaded["conditions"] || get().loading["conditions"]) return;
    set((s) => ({ loading: { ...s.loading, conditions: true } }));
    const conditions = await referenceApi.conditions();
    set((s) => ({ conditions, loaded: { ...s.loaded, conditions: true }, loading: { ...s.loading, conditions: false } }));
  },

  loadFeats: async () => {
    if (get().loaded["feats"] || get().loading["feats"]) return;
    set((s) => ({ loading: { ...s.loading, feats: true } }));
    const feats = await referenceApi.feats();
    set((s) => ({ feats, loaded: { ...s.loaded, feats: true }, loading: { ...s.loading, feats: false } }));
  },

  loadSpells: async (filters) => {
    set((s) => ({ loading: { ...s.loading, spells: true } }));
    const spells = await referenceApi.spells(filters);
    set((s) => ({ spells, loaded: { ...s.loaded, spells: true }, loading: { ...s.loading, spells: false } }));
  },

  loadItems: async (filters) => {
    set((s) => ({ loading: { ...s.loading, items: true } }));
    const items = await referenceApi.items(filters);
    set((s) => ({ items, loaded: { ...s.loaded, items: true }, loading: { ...s.loading, items: false } }));
  },
}));
