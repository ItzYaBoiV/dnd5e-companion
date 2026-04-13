/**
 * api.ts
 *
 * ALL network calls go through this file.
 * Components and stores never call fetch() directly.
 * This makes it easy to mock, test, and switch to React Native later.
 */

import type {
  Character, CharacterSummary, Race, DndClass, Background,
  Spell, Item, Feat, Condition, SpellSlot,
  HpChangeType, RestType, AdvantageType, AttackRollResult,
} from "@/types/dnd";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

// ── Core fetch wrapper ────────────────────────────────────────────
async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json();

  if (!res.ok) {
    const message = data?.error ?? `HTTP ${res.status}`;
    const details = data?.details as Record<string, string[] | undefined> | undefined;
    const detailStr =
      details && typeof details === "object"
        ? Object.entries(details)
            .filter(([, v]) => Array.isArray(v) && v.length > 0)
            .map(([k, v]) => `${k}: ${(v as string[]).join(", ")}`)
            .join("; ")
        : "";
    throw new Error(detailStr ? `${message} — ${detailStr}` : message);
  }

  return data as T;
}

const get    = <T>(path: string)                     => request<T>("GET",    path);
const post   = <T>(path: string, body: unknown)      => request<T>("POST",   path, body);
const patch  = <T>(path: string, body: unknown)      => request<T>("PATCH",  path, body);
const del    = <T>(path: string)                     => request<T>("DELETE", path);

// ── Characters ────────────────────────────────────────────────────
export const characterApi = {
  list:   () => get<CharacterSummary[]>("/characters"),
  get:    (id: string) => get<Character>(`/characters/${id}`),
  create: (body: unknown) => post<Character>("/characters", body),
  update: (id: string, body: unknown) => patch<Character>(`/characters/${id}`, body),
  levelUp: (
    id: string,
    body: {
      hpIncrease?: number;
      classSlug?: string;
      subclassSlug?: string;
      grantFeatures?: { name: string; description?: string; source?: string }[];
      learnSpells?: { spellSlug: string; prepared?: boolean; alwaysPrepared?: boolean }[];
      abilityScoreImprovement?: { ability: string; increase: 1 | 2 }[];
    } = {},
  ) => post<Character>(`/characters/${id}/level-up`, body),
  delete: (id: string) => del<void>(`/characters/${id}`),

  // HP
  changeHp: (id: string, type: HpChangeType, amount: number) =>
    post<Character>(`/characters/${id}/hp`, { type, amount }),

  // Death saves
  recordDeathSave: (id: string, result: "success" | "failure", natural20 = false) =>
    post<Character & { event: string }>(`/characters/${id}/death-save`, { result, natural20 }),
  stabilize: (id: string) => post<Character>(`/characters/${id}/stabilize`, {}),

  // Rest
  rest: (
    id: string,
    type: RestType,
    hitDiceToSpend = 0,
    hitDiceFrom?: { characterClassLevelId: string; amount: number }[],
  ) =>
    post<Character>(`/characters/${id}/rest`, {
      type,
      hitDiceToSpend,
      ...(hitDiceFrom?.length ? { hitDiceFrom } : {}),
    }),

  // Spell slots
  useSpellSlot:     (id: string, level: number) =>
    patch<SpellSlot>(`/characters/${id}/spell-slots/${level}`, { action: "use", amount: 1 }),
  recoverSpellSlot: (id: string, level: number, amount = 1) =>
    patch<SpellSlot>(`/characters/${id}/spell-slots/${level}`, { action: "recover", amount }),

  // Conditions
  addCondition:    (id: string, conditionSlug: string, notes = "") =>
    post(`/characters/${id}/conditions`, { conditionSlug, notes }),
  removeCondition: (id: string, conditionId: string) =>
    del(`/characters/${id}/conditions/${conditionId}`),

  // Inventory
  addItem:    (id: string, body: unknown) =>
    post(`/characters/${id}/inventory`, body),
  updateItem: (id: string, itemId: string, body: unknown) =>
    patch(`/characters/${id}/inventory/${itemId}`, body),
  removeItem: (id: string, itemId: string) =>
    del(`/characters/${id}/inventory/${itemId}`),

  // Spells
  addSpell:    (id: string, spellSlug: string, prepared = false) =>
    post(`/characters/${id}/spells`, { spellSlug, prepared }),
  updateSpell: (id: string, spellId: string, body: unknown) =>
    patch(`/characters/${id}/spells/${spellId}`, body),
  removeSpell: (id: string, spellId: string) =>
    del(`/characters/${id}/spells/${spellId}`),

  addFeature: (id: string, body: unknown) =>
    post<Character>(`/characters/${id}/features`, body),
};

// ── Reference (SRD Data) ──────────────────────────────────────────
export const referenceApi = {
  races:       () => get<Race[]>("/reference/races"),
  race:        (slug: string) => get<Race>(`/reference/races/${slug}`),

  classes:     () => get<DndClass[]>("/reference/classes"),
  class:       (slug: string) => get<DndClass>(`/reference/classes/${slug}`),

  backgrounds: () => get<Background[]>("/reference/backgrounds"),
  background:  (slug: string) => get<Background>(`/reference/backgrounds/${slug}`),

  spells: (filters?: {
    class?: string; level?: number; school?: string;
    search?: string; ritual?: boolean; concentration?: boolean;
  }) => {
    const params = new URLSearchParams();
    if (filters?.class)         params.set("class",         filters.class);
    if (filters?.level !== undefined) params.set("level",   String(filters.level));
    if (filters?.school)        params.set("school",        filters.school);
    if (filters?.search)        params.set("search",        filters.search);
    if (filters?.ritual !== undefined) params.set("ritual", String(filters.ritual));
    if (filters?.concentration !== undefined) params.set("concentration", String(filters.concentration));
    const qs = params.toString();
    return get<Spell[]>(`/reference/spells${qs ? `?${qs}` : ""}`);
  },
  spell: (slug: string) => get<Spell>(`/reference/spells/${slug}`),

  items: (filters?: { category?: string; subcategory?: string; search?: string; magical?: boolean }) => {
    const params = new URLSearchParams();
    if (filters?.category)    params.set("category",    filters.category);
    if (filters?.subcategory) params.set("subcategory", filters.subcategory);
    if (filters?.search)      params.set("search",      filters.search);
    if (filters?.magical !== undefined) params.set("magical", String(filters.magical));
    const qs = params.toString();
    return get<Item[]>(`/reference/items${qs ? `?${qs}` : ""}`);
  },
  item: (slug: string) => get<Item>(`/reference/items/${slug}`),

  feats:      () => get<Feat[]>("/reference/feats"),
  feat:       (slug: string) => get<Feat>(`/reference/feats/${slug}`),
  conditions: () => get<Condition[]>("/reference/conditions"),
  condition:  (slug: string) => get<Condition>(`/reference/conditions/${slug}`),
};

// ── Combat ────────────────────────────────────────────────────────
export const combatApi = {
  rollAttack:    (id: string, weaponItemId: string, advantage: AdvantageType = "normal") =>
    post<AttackRollResult>(`/combat/${id}/roll/attack`, { weaponItemId, advantage }),
  rollSave:      (id: string, ability: string, advantage: AdvantageType = "normal") =>
    post(`/combat/${id}/roll/save`, { ability, advantage }),
  rollCheck:     (id: string, skill: string, advantage: AdvantageType = "normal") =>
    post(`/combat/${id}/roll/check`, { skill, advantage }),
  rollInitiative:(id: string) =>
    get(`/combat/${id}/roll/initiative`),
};

// ── Monsters ──────────────────────────────────────────────────────
export const monsterApi = {
  list: (filters?: { type?: string; size?: string; minCr?: number; maxCr?: number; search?: string; environment?: string }) => {
    const p = new URLSearchParams();
    if (filters?.type)        p.set("type",        filters.type);
    if (filters?.size)        p.set("size",        filters.size);
    if (filters?.minCr !== undefined) p.set("minCr", String(filters.minCr));
    if (filters?.maxCr !== undefined) p.set("maxCr", String(filters.maxCr));
    if (filters?.search)      p.set("search",      filters.search);
    if (filters?.environment) p.set("environment", filters.environment);
    const qs = p.toString();
    return get<import("@/types/dnd").MonsterSummary[]>(`/monsters${qs ? `?${qs}` : ""}`);
  },
  get:      (slug: string) => get<import("@/types/dnd").Monster>(`/monsters/${slug}`),
  /** CR uses numeric comparison (e.g. 0–0.25 for Beast Master companions). */
  byCr:     (crMin: number, crMax: number) =>
    get<import("@/types/dnd").MonsterSummary[]>(`/monsters/by-cr?crMin=${crMin}&crMax=${crMax}`),
  byLevel:  (level: number, count = 20) => get<import("@/types/dnd").MonsterSummary[]>(`/monsters/by-level?level=${level}&count=${count}`),
  difficulty:(partyLevels: number[], monsterXps: number[]) =>
    post<{ totalXp: number; adjustedXp: number; difficulty: string; thresholds: Record<string, number> }>("/monsters/encounter-difficulty", { partyLevels, monsterXps }),
};

// ── Adventures ────────────────────────────────────────────────────
export const adventureApi = {
  list: (filters?: { type?: string; difficulty?: string }) => {
    const p = new URLSearchParams();
    if (filters?.type)       p.set("type",       filters.type);
    if (filters?.difficulty) p.set("difficulty", filters.difficulty);
    const qs = p.toString();
    return get<import("@/types/dnd").AdventureSummary[]>(`/adventures${qs ? `?${qs}` : ""}`);
  },
  get:    (id: string) => get<import("@/types/dnd").Adventure>(`/adventures/${id}`),
  update: (id: string, body: unknown) => patch<import("@/types/dnd").Adventure>(`/adventures/${id}`, body),
  delete: (id: string) => del<void>(`/adventures/${id}`),
  generateDungeon:   (body: unknown) => post<import("@/types/dnd").Adventure>("/adventures/generate/dungeon",   body),
  generateCity:      (body: unknown) => post<import("@/types/dnd").Adventure>("/adventures/generate/city",      body),
  generateStory:     (body: unknown) => post<import("@/types/dnd").Adventure>("/adventures/generate/story",     body),
  generateEncounter: (body: unknown) => post<unknown>("/adventures/generate/encounter", body),
};

// ── Sessions ──────────────────────────────────────────────────────
export const sessionApi = {
  list:   () => get<import("@/types/dnd").SessionSummary[]>("/sessions"),
  create: (body: { name: string; adventureId?: string; characterIds: string[] }) =>
    post<import("@/types/dnd").Session>("/sessions", body),
  get:    (id: string) => get<import("@/types/dnd").Session>(`/sessions/${id}`),
  delete: (id: string) => del<void>(`/sessions/${id}`),
  setInitiative:   (id: string, combatants: unknown[]) =>
    post<import("@/types/dnd").Session>(`/sessions/${id}/initiative`, { combatants }),
  nextTurn:        (id: string) => post<import("@/types/dnd").Session>(`/sessions/${id}/next-turn`, {}),
  updateCombatantHp:(id: string, combatantId: string, hp: number) =>
    patch<import("@/types/dnd").Session>(`/sessions/${id}/combatant/${combatantId}/hp`, { hp }),
  updatePartyHp:   (id: string, characterId: string, hp: number) =>
    patch<import("@/types/dnd").Session>(`/sessions/${id}/party/${characterId}/hp`, { hp }),
  addLog:          (id: string, type: string, message: string) =>
    post<import("@/types/dnd").Session>(`/sessions/${id}/log`, { type, message }),
  rollGuide:       (characterId: string, action: string) =>
    post<import("@/types/dnd").RollGuide>("/sessions/roll-guide", { characterId, action }),
};

// ── AI Status ─────────────────────────────────────────────────────
export const aiApi = {
  status: () => get<{ url: string; healthy: boolean; busy: boolean; model: string }[]>("/ai/status"),
};
