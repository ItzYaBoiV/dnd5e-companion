import { create } from "zustand";
import { characterApi } from "@/services/api";
import type { Character } from "@/types/dnd";

const API = "/api";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

export interface SessionSummary {
  id: string; name: string; status: string;
  characters: { characterId: string; playerName: string; isActive: boolean }[];
  updatedAt: string;
}

export interface ActiveSession {
  id: string; name: string; status: string; notes: string;
  dungeonId: string | null; storyId: string | null;
  characters: { id: string; characterId: string; playerName: string; isActive: boolean }[];
  combats: Combat[];
}

export interface Combat {
  id: string;
  name: string;
  status: string;
  round: number;
  /** Index into initiative-sorted alive combatants (high init first). */
  currentTurnIndex?: number;
  /** ISO from API — used to pick the current fight when multiple exist */
  createdAt?: string;
  combatants: Combatant[];
  turnOrder?: Combatant[];
}

/** Prefer newest active combat (fixes wrong combat after end → start). */
function pickActiveCombat(combats: Combat[] | undefined): Combat | null {
  const actives = combats?.filter((c) => c.status === "active") ?? [];
  if (actives.length === 0) return null;
  if (actives.length === 1) return actives[0];
  return actives.reduce((best, c) => {
    const ta = c.createdAt ? Date.parse(c.createdAt) : 0;
    const tb = best.createdAt ? Date.parse(best.createdAt) : 0;
    return ta > tb ? c : best;
  });
}

export interface Combatant {
  id: string; type: "player" | "monster"; label: string;
  characterId: string | null; monsterSlug: string | null;
  initiative: number; currentHp: number; maxHp: number;
  temporaryHp: number; armorClass: number;
  conditions: string[]; isConcentrating: boolean;
  isAlive: boolean; notes: string;
}

export interface RollSummary {
  inCombat: boolean;
  round?: number;
  combatId?: string;
  turnOrder?: Combatant[];
  playerRolls: PlayerRollInfo[];
  dmRolls: DmRollInfo[];
}

export interface PlayerRollInfo {
  characterId: string; characterName: string; classSlug: string;
  level: number; currentHp: number; maxHp: number;
  initiative: number; passivePerception: number;
  keyRolls: {
    attacks: { melee: { bonus: number; label: string }; ranged: { bonus: number; label: string }; spell: { bonus: number; dc: number; label: string } | null };
    saves: Record<string, { bonus: number; proficient: boolean }>;
    skills: Record<string, number>;
  };
}

export interface DmRollInfo {
  combatantId: string; label: string; monsterSlug: string; monsterName: string;
  currentHp: number; maxHp: number; armorClass: number;
  actions: { name: string; description: string; attackBonus: number | null; damageDice: string | null; damageBonus: number | null; damageType: string | null; saveDc: number | null; saveType: string | null }[];
  legendaryActions?: { name: string; description: string; attackBonus: number | null; damageDice: string | null; damageBonus: number | null; damageType: string | null; saveDc: number | null; saveType: string | null }[];
  legendaryActionPoints?: number;
}

export interface ConcentrationBanner {
  name: string;
  dc: number;
  characterId: string | null;
}

interface SessionStore {
  sessions:        SessionSummary[];
  activeSession:   ActiveSession | null;
  activeCombat:    Combat | null;
  rollSummary:     RollSummary | null;
  partyCharacters: Character[];
  isLoading:       boolean;
  error:           string | null;
  /** Shown when a concentrating combatant takes damage (any source). */
  concentrationBanner: ConcentrationBanner | null;

  loadSessions:     () => Promise<void>;
  loadSession:      (id: string) => Promise<void>;
  createSession:    (name: string) => Promise<ActiveSession>;
  deleteSession:    (id: string) => Promise<void>;

  addCharacter:     (characterId: string, playerName: string) => Promise<void>;
  removeCharacter:  (characterId: string) => Promise<void>;
  loadPartyChars:   () => Promise<void>;

  startCombat:      (name: string, combatants: Partial<Combatant>[]) => Promise<void>;
  appendCombatantsToCombat: (combatants: Partial<Combatant>[]) => Promise<void>;
  endCombat:        () => Promise<void>;
  nextRound:        () => Promise<void>;
  nextTurn:         () => Promise<void>;
  damageCombatant:  (combatantId: string, amount: number) => Promise<void>;
  healCombatant:    (combatantId: string, amount: number) => Promise<void>;
  updateCombatant:  (combatantId: string, data: Partial<Combatant>) => Promise<void>;
  refreshRolls:     () => Promise<void>;
  clearConcentrationBanner: () => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [], activeSession: null, activeCombat: null,
  rollSummary: null, partyCharacters: [], isLoading: false, error: null,
  concentrationBanner: null,

  loadSessions: async () => {
    set({ isLoading: true });
    try {
      const sessions = await req<SessionSummary[]>("GET", "/sessions");
      set({ sessions, isLoading: false });
    } catch (e) { set({ error: String(e), isLoading: false }); }
  },

  loadSession: async (id) => {
    set({ isLoading: true });
    try {
      const session = await req<ActiveSession>("GET", `/sessions/${id}`);
      const activeCombat = pickActiveCombat(session.combats);
      set({ activeSession: session, activeCombat, isLoading: false });
      await get().loadPartyChars();
      if (activeCombat) await get().refreshRolls();
    } catch (e) { set({ error: String(e), isLoading: false }); }
  },

  createSession: async (name) => {
    const session = await req<ActiveSession>("POST", "/sessions", { name });
    set((s) => ({ sessions: [session as unknown as SessionSummary, ...s.sessions], activeSession: session }));
    return session;
  },

  deleteSession: async (id) => {
    await req("DELETE", `/sessions/${id}`);
    set((s) => ({ sessions: s.sessions.filter((se) => se.id !== id), activeSession: null }));
  },

  addCharacter: async (characterId, playerName) => {
    const sid = get().activeSession?.id;
    if (!sid) return;
    await req("POST", `/sessions/${sid}/characters`, { characterId, playerName });
    await get().loadSession(sid);
  },

  removeCharacter: async (characterId) => {
    const sid = get().activeSession?.id;
    if (!sid) return;
    await req("DELETE", `/sessions/${sid}/characters/${characterId}`);
    await get().loadSession(sid);
  },

  loadPartyChars: async () => {
    const session = get().activeSession;
    if (!session) return;
    const ids = session.characters.filter((c) => c.isActive).map((c) => c.characterId);
    const chars = await Promise.all(ids.map((id) => characterApi.get(id)));
    set({ partyCharacters: chars });
  },

  startCombat: async (name, combatants) => {
    const sid = get().activeSession?.id;
    if (!sid) return;
    await req<Combat>("POST", `/sessions/${sid}/combats`, { name, combatants });
    await get().loadSession(sid);
  },

  appendCombatantsToCombat: async (combatants) => {
    const sid = get().activeSession?.id;
    const cid = get().activeCombat?.id;
    if (!sid || !cid || !combatants.length) return;
    const combat = await req<Combat>("POST", `/sessions/${sid}/combats/${cid}/append-combatants`, { combatants });
    set({ activeCombat: combat });
    await get().loadSession(sid);
    await get().refreshRolls();
  },

  endCombat: async () => {
    const sid = get().activeSession?.id;
    const cid = get().activeCombat?.id;
    if (!sid || !cid) return;
    await req("POST", `/sessions/${sid}/combats/${cid}/end`);
    set({ rollSummary: null, concentrationBanner: null });
    await get().loadSession(sid);
  },

  nextRound: async () => {
    const sid = get().activeSession?.id;
    const cid = get().activeCombat?.id;
    if (!sid || !cid) return;
    const updated = await req<Combat>("POST", `/sessions/${sid}/combats/${cid}/next-round`);
    set({ activeCombat: updated });
  },

  nextTurn: async () => {
    const sid = get().activeSession?.id;
    const cid = get().activeCombat?.id;
    if (!sid || !cid) return;
    const updated = await req<Combat>("POST", `/sessions/${sid}/combats/${cid}/next-turn`);
    set({ activeCombat: updated });
  },

  damageCombatant: async (combatantId, amount) => {
    const sid = get().activeSession?.id;
    const cid = get().activeCombat?.id;
    if (!sid || !cid) return;
    const prev = get().activeCombat?.combatants.find((x) => x.id === combatantId);
    const needConc =
      Boolean(prev?.isConcentrating && amount > 0 && prev.label);
    const concPayload = needConc && prev
      ? {
          name: prev.label,
          dc: Math.max(10, Math.floor(amount / 2)),
          characterId: prev.characterId ?? null,
        }
      : null;
    await req("POST", `/sessions/${sid}/combats/${cid}/combatants/${combatantId}/damage`, { amount });
    await get().loadSession(sid);
    if (concPayload) set({ concentrationBanner: concPayload });
  },

  clearConcentrationBanner: () => set({ concentrationBanner: null }),

  healCombatant: async (combatantId, amount) => {
    const sid = get().activeSession?.id;
    const cid = get().activeCombat?.id;
    if (!sid || !cid) return;
    await req("POST", `/sessions/${sid}/combats/${cid}/combatants/${combatantId}/heal`, { amount });
    await get().loadSession(sid);
  },

  updateCombatant: async (combatantId, data) => {
    const sid = get().activeSession?.id;
    const cid = get().activeCombat?.id;
    if (!sid || !cid) return;
    await req("PATCH", `/sessions/${sid}/combats/${cid}/combatants/${combatantId}`, data);
    await get().loadSession(sid);
  },

  refreshRolls: async () => {
    const sid = get().activeSession?.id;
    if (!sid) return;
    try {
      const summary = await req<RollSummary>("GET", `/sessions/${sid}/rolls`);
      set({ rollSummary: summary });
    } catch { /* non-critical */ }
  },
}));
