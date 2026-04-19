import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSessionStore } from "@/store/sessionStore";
import type { Combatant, PlayerRollInfo, DmRollInfo } from "@/store/sessionStore";
import { characterApi } from "@/services/api";
import type { CharacterSummary } from "@/types/dnd";
import { LoadingSpinner, formatModifier, HPBar, Modal } from "@/components/common";
import { Plus, Sword, Shield, Zap, RefreshCw, SkipForward, X, ChevronDown, ChevronRight, Skull } from "lucide-react";
import { clsx } from "clsx";
import DungeonForge from "@/components/dungeon-forge/DungeonForge";
import { DungeonMapCanvas } from "@/components/dungeon-forge/DungeonMapCanvas";
import { buildRenderGrid } from "@/lib/dungeonForgeRenderGrid";
import { decrementForgeMonsterBySlug, removeEntityAtXY } from "@/lib/dungeonEntityUpdates";
import { makeSeededRng, pickWallAdjacentFloorCells } from "@/lib/forgeWallLights";
import type { RenderCell } from "@/lib/dungeonTileRenderer";
import { DEFAULT_PALETTE, ENTITY_PALETTE, LOCATION_PALETTE } from "@/lib/dungeonTilePalettes";
import {
  computeVisibleCellsForPlayer,
  expandFogWithPlayerTokenVision,
  isDungeonGridWalkable,
  isOpenFloorLocation,
  maxFogHopsForLocationType,
} from "@/lib/dungeonForgeFog";
import { greedyStepToward } from "@/lib/dungeonGridMovement";
import { DEFAULT_PLAYER_VISION_FOG_CELLS, PLAYER_SIGHT_RING_CELLS } from "@/lib/playerMapVision";
import { visionRadiusCellsFromCharacter } from "@/lib/playerVisionFromCharacter";
import {
  broadcastPlayerMapState,
  readLastPlayerMapState,
  type BattleToken,
  type PlayerDungeonData,
  type PlayerMapBroadcast,
  type SceneLight,
} from "@/lib/playerMapBroadcast";
import { broadcastLaserPointer } from "@/lib/playerMapLaser";
import {
  extractDiceNotation,
  rollAttackVsAc,
  rollMonsterDamage,
  type AttackRollResult,
  type DamageRollResult,
} from "@/lib/quickDiceRoll";
import { battleTokenExtras } from "@/lib/battleTokenMedia";

type FlowStep = "map" | "party" | "workspace";
type WorkspacePane = "combat" | "rolls";

/** Player TV crop window centered on the party leader (grid cells). */
function computeLeaderViewCrop(
  gw: number,
  gh: number,
  gx: number,
  gy: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const halfW = 18;
  const halfH = 14;
  return {
    minX: Math.max(0, Math.floor(gx - halfW)),
    minY: Math.max(0, Math.floor(gy - halfH)),
    maxX: Math.min(gw - 1, Math.ceil(gx + halfW)),
    maxY: Math.min(gh - 1, Math.ceil(gy + halfH)),
  };
}

export default function PlayPage() {
  const {
    sessions,
    activeSession,
    partyCharacters,
    loadSessions,
    loadSession,
    createSession,
    deleteSession,
  } = useSessionStore();
  const [step, setStep] = useState<FlowStep>("map");
  const [workspacePane, setWorkspacePane] = useState<WorkspacePane>("combat");
  const [creatingName, setCreatingName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [dungeonHasRooms, setDungeonHasRooms] = useState(false);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!activeSession?.id) {
      setDungeonHasRooms(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/sessions/${activeSession.id}/dungeon`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setDungeonHasRooms(Array.isArray(j?.rooms) && j.rooms.length > 0);
      })
      .catch(() => {
        if (!cancelled) setDungeonHasRooms(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSession?.id]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (
        ev?.data?.type === "forge:session-dungeon-saved" &&
        ev.data.sessionId === activeSession?.id
      ) {
        setDungeonHasRooms(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [activeSession?.id]);

  useEffect(() => {
    if (!activeSession?.id) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/sessions/${activeSession.id}/dungeon`);
      const j = await res.json().catch(() => null);
      if (cancelled) return;
      const hasDungeon = Array.isArray(j?.rooms) && j.rooms.length > 0;
      const hasParty = (activeSession.characters?.length ?? 0) > 0;
      if (hasDungeon && hasParty) setStep("workspace");
      else if (hasDungeon && !hasParty) setStep("party");
      else setStep("map");
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSession?.id]);

  const handleCreate = async () => {
    if (!creatingName.trim()) return;
    const session = await createSession(creatingName.trim());
    setShowCreate(false);
    setCreatingName("");
    await loadSession(session.id);
    setStep("map");
  };

  const stepperItems: { id: FlowStep; label: string; done: boolean }[] = [
    { id: "map", label: "1. Map", done: step !== "map" },
    { id: "party", label: "2. Party", done: step === "workspace" },
    { id: "workspace", label: "3. Dungeon", done: false },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-800 bg-dnd-dark px-4 py-3 sm:px-6">
        <div>
          <h1 className="font-display text-xl font-bold text-dnd-gold sm:text-2xl">DM Play Mode</h1>
          <p className="text-xs text-gray-500">Map → party → run encounters in one workspace.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeSession && (
            <div className="flex flex-wrap items-center gap-1.5">
              {stepperItems.map((s) => {
                const canClick =
                  s.id === "map" ||
                  (s.id === "party" && dungeonHasRooms) ||
                  (s.id === "workspace" && dungeonHasRooms && partyCharacters.length > 0);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => canClick && setStep(s.id)}
                    disabled={!canClick}
                    className={clsx(
                      "rounded px-3 py-1.5 font-display text-sm font-semibold transition-colors",
                      step === s.id
                        ? "bg-dnd-red text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white",
                      s.done && step !== s.id && "text-dnd-gold",
                      !canClick && "cursor-not-allowed opacity-40",
                    )}
                  >
                    {s.done && step !== s.id ? "✓ " : ""}
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-primary flex items-center gap-1 text-sm"
          >
            <Plus size={14} /> New Session
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-4 pb-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:pb-4">
        {!activeSession ? (
          <SessionPicker
            sessions={sessions}
            onSelect={(id) => {
              void loadSession(id);
            }}
            onDelete={deleteSession}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {step === "map" && (
              <MapStep onContinue={() => setStep("party")} activeSessionId={activeSession.id} />
            )}
            {step === "party" && (
              <PartyStep onContinue={() => setStep("workspace")} onBack={() => setStep("map")} />
            )}
            {step === "workspace" && (
              <EncounterWorkspace pane={workspacePane} onPaneChange={setWorkspacePane} />
            )}
          </div>
        )}
      </div>

      {showCreate && (
        <Modal
          title="New Session"
          onClose={() => setShowCreate(false)}
          footer={
            <>
              <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!creatingName.trim()}
                className="btn-primary"
              >
                Create
              </button>
            </>
          }
        >
          <input
            type="text"
            value={creatingName}
            onChange={(e) => setCreatingName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleCreate()}
            placeholder="Session name (e.g. 'The Lost Mine - Session 3')"
            className="input-field w-full"
            spellCheck
            autoFocus
          />
        </Modal>
      )}
    </div>
  );
}

// ── Session Picker ────────────────────────────────────────────────
function SessionPicker({
  sessions,
  onSelect,
  onDelete,
}: {
  sessions: any[];
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="max-w-2xl">
      <h2 className="mb-4 font-display text-lg font-bold text-gray-300">Select a Session</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500">No sessions yet — create one above.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="dnd-card flex cursor-pointer items-center justify-between hover:border-gray-500"
              onClick={() => onSelect(s.id)}
            >
              <div>
                <p className="font-display font-bold text-white">{s.name}</p>
                <p className="text-xs text-gray-500">
                  {s.characters?.length ?? 0} characters · {s.status}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(s.id);
                }}
                className="text-gray-600 transition-colors hover:text-red-400"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Map step (embedded forge) ───────────────────────────────────
function MapStep({ onContinue, activeSessionId }: { onContinue: () => void; activeSessionId: string }) {
  const [hasSaved, setHasSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sessions/${activeSessionId}/dungeon`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j && (j.rooms?.length ?? 0) > 0) setHasSaved(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);

  useEffect(() => {
    const handler = (ev: MessageEvent) => {
      if (
        ev?.data?.type === "forge:session-dungeon-saved" &&
        ev.data.sessionId === activeSessionId
      ) {
        setHasSaved(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [activeSessionId]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-800 bg-dnd-darker px-2 py-2">
        <span className="text-xs text-gray-400">
          Generate or load a map. In the forge rail, pick this session under <b>ACTIVE SESSION</b>, then{" "}
          <b>SEND TO SESSION</b>. Then press Continue.
        </span>
        <button
          type="button"
          onClick={onContinue}
          disabled={!hasSaved}
          className={clsx(
            "btn-primary ml-auto flex items-center gap-1 text-sm",
            !hasSaved && "cursor-not-allowed opacity-50",
          )}
        >
          Continue to Party →
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <DungeonForge />
      </div>
    </div>
  );
}

// ── Party step ────────────────────────────────────────────────────
function PartyStep({
  onContinue,
  onBack,
}: {
  onContinue: () => void;
  onBack: () => void;
}) {
  const { activeSession, partyCharacters, addCharacter, removeCharacter } = useSessionStore();
  const [allChars, setAllChars] = useState<CharacterSummary[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [selectedChar, setSelectedChar] = useState("");

  useEffect(() => {
    characterApi.list().then(setAllChars).catch(console.error);
  }, []);

  const addedIds = new Set(activeSession?.characters.map((c) => c.characterId) ?? []);

  const handleAdd = () => {
    if (!selectedChar) return;
    void addCharacter(selectedChar, playerName || "Player");
    setSelectedChar("");
    setPlayerName("");
  };

  return (
    <div className="max-w-2xl space-y-4 overflow-auto">
      <div className="dnd-card">
        <h2 className="mb-1 font-display font-bold text-dnd-gold">{activeSession?.name}</h2>
        <p className="mb-4 text-xs text-gray-500">Pick the characters running this dungeon.</p>

        <div className="mb-4 flex gap-2">
          <select
            value={selectedChar}
            onChange={(e) => setSelectedChar(e.target.value)}
            className="input-field flex-1 text-sm"
          >
            <option value="">Select character...</option>
            {allChars
              .filter((c) => !addedIds.has(c.id))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} (Lvl {c.level} {c.classSlug})
                </option>
              ))}
          </select>
          <input
            type="text"
            placeholder="Player name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="input-field w-32 text-sm"
            spellCheck
          />
          <button type="button" onClick={handleAdd} disabled={!selectedChar} className="btn-primary px-3 text-sm">
            Add
          </button>
        </div>

        {partyCharacters.length === 0 ? (
          <p className="text-sm italic text-gray-600">No characters in this session yet.</p>
        ) : (
          <div className="space-y-2">
            {partyCharacters.map((char) => {
              const sc = activeSession?.characters.find((c) => c.characterId === char.id);
              return (
                <div key={char.id} className="flex items-center justify-between rounded bg-gray-900 p-3">
                  <div>
                    <p className="font-display font-bold text-white">{char.name}</p>
                    <p className="text-xs capitalize text-gray-500">
                      {sc?.playerName} · Level {char.level} {char.raceSlug} {char.classSlug}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <span className={char.currentHp > 0 ? "text-green-400" : "text-red-400"}>
                      {char.currentHp}/{char.maxHp} HP
                    </span>
                    <button
                      type="button"
                      onClick={() => void removeCharacter(char.id)}
                      className="text-gray-600 hover:text-red-400"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="btn-secondary text-sm">
          ← Back to Map
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={partyCharacters.length === 0}
          className={clsx(
            "btn-primary text-sm",
            partyCharacters.length === 0 && "cursor-not-allowed opacity-50",
          )}
        >
          Continue to Dungeon →
        </button>
      </div>
    </div>
  );
}

/** Resolve forge room monster entities into combatant payloads (SRD lookup). */
async function buildForgeMonsterCombatants(
  roomMonsters: { slug?: string; name?: string; count?: number }[],
): Promise<
  {
    type: "monster";
    monsterSlug: string;
    label: string;
    initiative: number;
    maxHp: number;
    armorClass: number;
  }[]
> {
  const nameToSlug = new Map<string, string>();
  const namesToResolve = [
    ...new Set(
      roomMonsters
        .filter((m) => !String(m.slug ?? "").trim() && m.name)
        .map((m) => String(m.name).trim()),
    ),
  ];
  if (namesToResolve.length > 0) {
    const res = await fetch("/api/monsters/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ names: namesToResolve }),
    });
    if (res.ok) {
      const arr = (await res.json()) as {
        name: string;
        slug: string;
        unresolved?: boolean;
      }[];
      for (const row of arr) {
        if (!row.unresolved && row.slug) {
          nameToSlug.set(String(row.name).toLowerCase(), row.slug);
        }
      }
    }
  }

  const monsterRows: {
    type: "monster";
    monsterSlug: string;
    label: string;
    initiative: number;
    maxHp: number;
    armorClass: number;
  }[] = [];

  for (const m of roomMonsters) {
    let slug = String(m.slug ?? "").trim();
    if (!slug && m.name) {
      slug = nameToSlug.get(String(m.name).toLowerCase()) ?? "";
    }
    if (!slug) continue;
    const res = await fetch(`/api/monsters/${encodeURIComponent(slug)}`);
    if (!res.ok) continue;
    const mon = await res.json();
    const count = Math.max(1, Number(m.count) || 1);
    let seq = 1;
    for (let k = 0; k < count; k++) {
      monsterRows.push({
        type: "monster",
        monsterSlug: mon.slug,
        label: `${mon.name} ${seq++}`,
        initiative: Math.floor(Math.random() * 20) + 1,
        maxHp: mon.hitPoints,
        armorClass: mon.armorClass,
      });
    }
  }
  return monsterRows;
}

// ── Encounter workspace (map + combat + rolls) ───────────────────
function EncounterWorkspace({
  pane,
  onPaneChange,
}: {
  pane: WorkspacePane;
  onPaneChange: (p: WorkspacePane) => void;
}) {
  const { activeSession, activeCombat, partyCharacters, startCombat, appendCombatantsToCombat, loadPartyChars } =
    useSessionStore();
  const [dungeon, setDungeon] = useState<any | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState<string | null>(null);
  const [animPhase, setAnimPhase] = useState(0);
  const [sceneLighting, setSceneLighting] = useState(true);
  /** DM laser dot on /dungeons/player (same browser; high-rate sync via BroadcastChannel). */
  const [laserPointerMode, setLaserPointerMode] = useState(false);
  const laserThrottleRef = useRef(0);
  /** When false and a room is selected, the map crops to that room (like the old “zoom to room”). */
  const [showFullMap, setShowFullMap] = useState(false);
  const [battleTokens, setBattleTokens] = useState<BattleToken[]>([]);
  const [placementCombatantId, setPlacementCombatantId] = useState<string | null>(null);
  const [mapEntityModal, setMapEntityModal] = useState<
    | null
    | { kind: "item"; x: number; y: number; ent: Record<string, unknown> }
    | { kind: "monster"; x: number; y: number; ent: Record<string, unknown> }
    | { kind: "riddle"; x: number; y: number; ent: Record<string, unknown> }
  >(null);
  const [giveQty, setGiveQty] = useState(1);
  const [giveCharId, setGiveCharId] = useState("");
  const [mapActionBusy, setMapActionBusy] = useState(false);
  /** DM map zoom (multiplier on computed cell size). Pan uses the scrollable viewport. */
  const [dmMapZoom, setDmMapZoom] = useState(1);
  const [partyLeaderId, setPartyLeaderId] = useState<string | null>(null);
  const [partyFollowIds, setPartyFollowIds] = useState<string[]>([]);
  const [partyMarchMode, setPartyMarchMode] = useState(false);
  const [tokenHoverTip, setTokenHoverTip] = useState<{
    tokens: BattleToken[];
    clientX: number;
    clientY: number;
  } | null>(null);
  const marchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const followerSnapRef = useRef<Record<string, { gx: number; gy: number }> | null>(null);

  const dungeonRef = useRef(dungeon);
  dungeonRef.current = dungeon;

  const prevMonsterHpRef = useRef<Record<string, number>>({});
  const activeCombatIdForMapRef = useRef<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setAnimPhase((p) => (p + 0.04) % 1), 380);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!activeCombat) setBattleTokens([]);
  }, [activeCombat]);

  useEffect(() => {
    if (!partyLeaderId) return;
    setPartyFollowIds((prev) => prev.filter((id) => id !== partyLeaderId));
  }, [partyLeaderId]);

  useEffect(() => {
    return () => {
      if (marchIntervalRef.current != null) {
        clearInterval(marchIntervalRef.current);
        marchIntervalRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!partyMarchMode && marchIntervalRef.current != null) {
      clearInterval(marchIntervalRef.current);
      marchIntervalRef.current = null;
    }
  }, [partyMarchMode]);

  const reloadDungeon = useCallback(() => {
    const sid = activeSession?.id;
    if (!sid) return;
    fetch(`/api/sessions/${sid}/dungeon`)
      .then((r) => r.json())
      .then(setDungeon)
      .catch(() => setDungeon(null));
  }, [activeSession?.id]);

  const persistDungeonSnapshot = useCallback(
    async (next: unknown) => {
      const sid = activeSession?.id;
      if (!sid) throw new Error("No session");
      const res = await fetch(`/api/sessions/${sid}/dungeon`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || "Failed to save map");
      }
      reloadDungeon();
    },
    [activeSession?.id, reloadDungeon],
  );

  useEffect(() => {
    reloadDungeon();
  }, [reloadDungeon]);

  useEffect(() => {
    if (selectedRoomId != null) setShowFullMap(false);
  }, [selectedRoomId]);

  const sendLaserHover = useCallback((gx: number, gy: number) => {
    const now = Date.now();
    if (now - laserThrottleRef.current < 40) return;
    laserThrottleRef.current = now;
    broadcastLaserPointer({ gx, gy });
  }, []);

  useEffect(() => {
    if (!laserPointerMode) broadcastLaserPointer(null);
    else setTokenHoverTip(null);
  }, [laserPointerMode]);

  useEffect(() => {
    return () => {
      broadcastLaserPointer(null);
    };
  }, []);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (
        ev?.data?.type === "forge:session-dungeon-saved" &&
        ev.data.sessionId === activeSession?.id
      ) {
        reloadDungeon();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [activeSession?.id, reloadDungeon]);

  useEffect(() => {
    if (mapEntityModal?.kind !== "item") return;
    setGiveQty(1);
    const first = partyCharacters[0]?.id;
    if (!first) return;
    setGiveCharId((prev) =>
      prev && partyCharacters.some((p) => p.id === prev) ? prev : first,
    );
  }, [mapEntityModal, partyCharacters]);

  useEffect(() => {
    const cid = activeCombat?.id ?? null;
    if (cid !== activeCombatIdForMapRef.current) {
      activeCombatIdForMapRef.current = cid;
      prevMonsterHpRef.current = {};
    }
    if (!activeCombat?.combatants?.length || !activeSession?.id) return;

    let working = dungeonRef.current;
    if (!working) return;

    let changed = false;
    for (const c of activeCombat.combatants) {
      if (c.type !== "monster" || !c.monsterSlug) continue;
      const prevHp = prevMonsterHpRef.current[c.id];
      prevMonsterHpRef.current[c.id] = c.currentHp;
      if (prevHp === undefined) continue;
      if (prevHp > 0 && c.currentHp <= 0) {
        const next = decrementForgeMonsterBySlug(working, c.monsterSlug, selectedRoomId);
        if (next) {
          working = next;
          changed = true;
        }
      }
    }

    if (!changed || !working) return;

    dungeonRef.current = working;
    void (async () => {
      try {
        await persistDungeonSnapshot(working);
      } catch (e) {
        console.error(e);
        setLaunchMsg(e instanceof Error ? e.message : "Could not update map after creature fell.");
        reloadDungeon();
      }
    })();
  }, [activeCombat, activeSession?.id, selectedRoomId, persistDungeonSnapshot, reloadDungeon]);

  const room =
    dungeon?.rooms?.find((r: { id: number }) => r.id === selectedRoomId) ?? null;
  const roomEntities = room
    ? (dungeon?.entities ?? []).filter((e: { roomId?: number }) => e.roomId === room.id)
    : [];
  const roomMonsters = roomEntities.filter((e: { type?: string }) => e.type === "monster");

  const renderGrid = useMemo(() => {
    if (!dungeon?.grid || !Array.isArray(dungeon?.rooms)) return null;
    try {
      return buildRenderGrid(dungeon, { showThemes: false });
    } catch {
      return null;
    }
  }, [dungeon]);

  const palette =
    (dungeon?.locationType && LOCATION_PALETTE[dungeon.locationType]) ?? DEFAULT_PALETTE;

  /** Padding around the focused room (DM crop + player TV crop). */
  const mapPad = 5;
  const focusCellPxFallback = 20;
  const fullCellPx = 12;

  const { displayGrid, worldOffset, cellPx } = useMemo(() => {
    if (!renderGrid || !dungeon) {
      return { displayGrid: null as ReturnType<typeof buildRenderGrid> | null, worldOffset: { x: 0, y: 0 }, cellPx: fullCellPx };
    }
    const gh = renderGrid.length;
    const gw = renderGrid[0]?.length ?? 0;
    if (showFullMap || !room) {
      return { displayGrid: renderGrid, worldOffset: { x: 0, y: 0 }, cellPx: fullCellPx };
    }
    const minX = Math.max(0, room.x - mapPad);
    const minY = Math.max(0, room.y - mapPad);
    const maxX = Math.min(gw - 1, room.x + room.w + mapPad - 1);
    const maxY = Math.min(gh - 1, room.y + room.h + mapPad - 1);
    const sub: typeof renderGrid = [];
    for (let y = minY; y <= maxY; y++) {
      const row = [];
      for (let x = minX; x <= maxX; x++) {
        row.push(renderGrid[y]![x]!);
      }
      sub.push(row);
    }
    return { displayGrid: sub, worldOffset: { x: minX, y: minY }, cellPx: focusCellPxFallback };
  }, [renderGrid, dungeon, room, showFullMap, mapPad]);

  const mapViewportRef = useRef<HTMLDivElement>(null);
  const [fitCellPx, setFitCellPx] = useState<number | null>(null);

  useEffect(() => {
    if (showFullMap || !room || !displayGrid?.length) {
      setFitCellPx(null);
      return;
    }
    const el = mapViewportRef.current;
    if (!el) return;
    const bw = displayGrid[0]?.length ?? 1;
    const bh = displayGrid.length;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w < 24 || h < 24) return;
      const next = Math.floor(Math.min(w / Math.max(1, bw), h / Math.max(1, bh)));
      const zoomOutPx = 4;
      setFitCellPx(Math.max(12, Math.min(64, next - zoomOutPx)));
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [showFullMap, room?.id, displayGrid]);

  const dmCellPx = !showFullMap && room && fitCellPx != null ? fitCellPx : cellPx;

  const zoomedDmCellPx = useMemo(
    () => Math.max(8, Math.min(128, Math.round(dmCellPx * dmMapZoom))),
    [dmCellPx, dmMapZoom],
  );

  /** Merge stored positions with current portraits / sprites from party + combat. */
  const tokensForMap = useMemo((): BattleToken[] => {
    if (!activeCombat?.combatants?.length) return battleTokens;
    return battleTokens.map((t) => {
      if (!t.id) return t;
      const c = activeCombat.combatants.find((x) => x.id === t.id);
      if (!c) return t;
      const extra = battleTokenExtras(c, partyCharacters);
      let sightRadiusCells: number | undefined;
      if (c.type === "player" && c.characterId) {
        const ch = partyCharacters.find((p) => p.id === c.characterId);
        sightRadiusCells = visionRadiusCellsFromCharacter(ch);
      }
      return { ...t, ...extra, sightRadiusCells };
    });
  }, [battleTokens, activeCombat, partyCharacters]);

  const playerCombatants = useMemo(
    () => activeCombat?.combatants?.filter((c) => c.type === "player" && c.isAlive) ?? [],
    [activeCombat],
  );

  const sceneLightsLocal = useMemo((): SceneLight[] | undefined => {
    if (!sceneLighting || !room || !dungeon?.grid) return undefined;
    const grid = dungeon.grid as number[][];
    const rng = makeSeededRng((room.id ?? 1) * 10007 + (selectedRoomId ?? 0) * 131);
    let positions = pickWallAdjacentFloorCells(grid, room, 4, rng);
    if (positions.length === 0) {
      positions = [
        {
          gx: Math.floor(Number(room.cx) || room.x + room.w / 2),
          gy: Math.floor(Number(room.cy) || room.y + room.h / 2),
        },
      ];
    }
    const lights: SceneLight[] = positions.map((p) => ({
      gx: p.gx,
      gy: p.gy,
      radiusCells: 6.2,
      intensity: 0.24,
      kind: "room",
    }));
    return lights.map((L) => ({
      ...L,
      gx: L.gx - worldOffset.x,
      gy: L.gy - worldOffset.y,
    }));
  }, [sceneLighting, room, worldOffset, dungeon, selectedRoomId]);

  const tokensLocal = useMemo(
    () =>
      tokensForMap.map((t) => ({
        ...t,
        gx: t.gx - worldOffset.x,
        gy: t.gy - worldOffset.y,
      })),
    [tokensForMap, worldOffset],
  );

  useLayoutEffect(() => {
    if (!room || !mapViewportRef.current || zoomedDmCellPx <= 0) return;
    const el = mapViewportRef.current;
    const pad = 2;
    const rx = room.x - worldOffset.x;
    const ry = room.y - worldOffset.y;
    const minPxX = Math.max(0, (rx - pad) * zoomedDmCellPx);
    const minPxY = Math.max(0, (ry - pad) * zoomedDmCellPx);
    const maxPxX = (rx + room.w + pad) * zoomedDmCellPx;
    const maxPxY = (ry + room.h + pad) * zoomedDmCellPx;
    const cx = (minPxX + maxPxX) / 2;
    const cy = (minPxY + maxPxY) / 2;
    el.scrollLeft = Math.max(0, cx - el.clientWidth / 2);
    el.scrollTop = Math.max(0, cy - el.clientHeight / 2);
  }, [room?.id, selectedRoomId, zoomedDmCellPx, worldOffset.x, worldOffset.y]);

  const broadcastToPlayer = useCallback(
    (opts: { cropToRoom: boolean }) => {
      if (!dungeon?.grid || !Array.isArray(dungeon.rooms)) return;
      const prev = readLastPlayerMapState();
      const revealed = Array.from(new Set([...(prev?.revealed ?? []), ...(room ? [room.id] : [])]));
      const doorForFog =
        prev?.doorOpen !== undefined && prev.doorOpen !== null ? new Set(prev.doorOpen) : null;
      const gd: PlayerDungeonData = {
        grid: dungeon.grid,
        rooms: dungeon.rooms,
        width: dungeon.width,
        height: dungeon.height,
        mapName: dungeon.mapName,
        entities: dungeon.entities ?? [],
        decoOverlay: dungeon.decoOverlay ?? [],
        locationType: dungeon.locationType,
        floor: dungeon.floor,
        glyphs: dungeon.glyphs,
      };
      const gh = dungeon.grid.length;
      const gw = dungeon.grid[0]?.length ?? 0;
      let viewCrop: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
      if (opts.cropToRoom) {
        const leaderTok = partyLeaderId
          ? tokensForMap.find((x) => x.id === partyLeaderId && x.kind === "player")
          : null;
        if (leaderTok) {
          viewCrop = computeLeaderViewCrop(gw, gh, leaderTok.gx, leaderTok.gy);
        } else if (room) {
          viewCrop = {
            minX: Math.max(0, room.x - mapPad),
            minY: Math.max(0, room.y - mapPad),
            maxX: Math.min(gw - 1, room.x + room.w + mapPad - 1),
            maxY: Math.min(gh - 1, room.y + room.h + mapPad - 1),
          };
        }
      }
      const fogCells = computeVisibleCellsForPlayer(
        new Set(revealed),
        {
          grid: dungeon.grid,
          rooms: dungeon.rooms,
          width: dungeon.width ?? gw,
          height: dungeon.height ?? gh,
        },
        doorForFog,
        null,
        {
          openFloor: isOpenFloorLocation(dungeon.locationType ?? "dungeon"),
          maxFogHops: maxFogHopsForLocationType(dungeon.locationType ?? "dungeon"),
        },
      );
      expandFogWithPlayerTokenVision(
        fogCells,
        dungeon.grid as number[][],
        tokensForMap,
        DEFAULT_PLAYER_VISION_FOG_CELLS,
      );
      const lightsWorld: SceneLight[] = [];
      if (sceneLighting && room) {
        const cx = Math.floor(Number(room.cx) || room.x + room.w / 2);
        const cy = Math.floor(Number(room.cy) || room.y + room.h / 2);
        lightsWorld.push({
          gx: cx,
          gy: cy,
          radiusCells: Math.max(room.w, room.h) + 2,
          intensity: 0.2,
          kind: "room",
        });
      }
      const payload: PlayerMapBroadcast = {
        dungeonData: gd,
        revealed,
        revealedCells: [...fogCells],
        fogColor: prev?.fogColor ?? "#000000",
        selectedRoomId: room?.id ?? prev?.selectedRoomId,
        viewCrop,
        battleTokens: tokensForMap,
      };
      if (prev?.doorOpen !== undefined && prev.doorOpen !== null) {
        payload.doorOpen = prev.doorOpen;
      }
      if (lightsWorld.length > 0) {
        payload.sceneLights = lightsWorld;
      }
      broadcastPlayerMapState(payload);
    },
    [dungeon, room, mapPad, tokensForMap, sceneLighting, partyLeaderId],
  );

  const syncPlayerTv = useCallback(() => broadcastToPlayer({ cropToRoom: true }), [broadcastToPlayer]);

  const syncPlayerTvFullFog = useCallback(
    () => broadcastToPlayer({ cropToRoom: false }),
    [broadcastToPlayer],
  );

  const broadcastRef = useRef(broadcastToPlayer);
  broadcastRef.current = broadcastToPlayer;

  const leaderPosKey = useMemo(() => {
    if (!partyLeaderId) return "";
    const t = tokensForMap.find((x) => x.id === partyLeaderId && x.kind === "player");
    return t ? `${Math.floor(t.gx)},${Math.floor(t.gy)}` : "";
  }, [partyLeaderId, tokensForMap]);

  useEffect(() => {
    if (!partyLeaderId || !leaderPosKey) return;
    const id = window.setTimeout(() => {
      broadcastRef.current?.({ cropToRoom: true });
    }, 110);
    return () => clearTimeout(id);
  }, [leaderPosKey, partyLeaderId]);

  const stopPartyMarch = useCallback(() => {
    if (marchIntervalRef.current != null) {
      clearInterval(marchIntervalRef.current);
      marchIntervalRef.current = null;
    }
  }, []);

  const startPartyMarch = useCallback(
    (targetGx: number, targetGy: number) => {
      const grid = dungeon?.grid as number[][] | undefined;
      if (!grid?.length || !activeCombat) return;
      const tile = grid[targetGy]?.[targetGx];
      if (!isDungeonGridWalkable(tile)) return;

      const marchTokens = (() => {
        const players = tokensForMap.filter((t) => t.kind === "player" && t.id);
        if (partyLeaderId) {
          const ids = new Set([partyLeaderId, ...partyFollowIds]);
          return players.filter((t) => t.id && ids.has(t.id));
        }
        return players;
      })();
      const marchIds = new Set(marchTokens.map((t) => t.id).filter(Boolean) as string[]);
      if (marchIds.size === 0) return;

      stopPartyMarch();
      const marchStepRef = { n: 0 };
      marchIntervalRef.current = window.setInterval(() => {
        marchStepRef.n += 1;
        setBattleTokens((prev) => {
          const occ = new Set(prev.map((t) => `${Math.floor(t.gx)},${Math.floor(t.gy)}`));
          let allDone = true;
          let changed = false;
          const next = prev.map((t) => {
            if (!t.id || !marchIds.has(t.id)) return t;
            if (Math.floor(t.gx) === targetGx && Math.floor(t.gy) === targetGy) return t;
            allDone = false;
            const selfKey = `${Math.floor(t.gx)},${Math.floor(t.gy)}`;
            const step = greedyStepToward(
              { gx: t.gx, gy: t.gy },
              { gx: targetGx, gy: targetGy },
              grid,
              occ,
              selfKey,
            );
            if (!step) return t;
            changed = true;
            occ.delete(selfKey);
            occ.add(`${step.gx},${step.gy}`);
            return { ...t, gx: step.gx, gy: step.gy };
          });
          if (allDone || !changed || marchStepRef.n > 900) {
            if (marchIntervalRef.current != null) {
              clearInterval(marchIntervalRef.current);
              marchIntervalRef.current = null;
            }
            queueMicrotask(() => broadcastRef.current?.({ cropToRoom: true }));
            return prev;
          }
          if (marchStepRef.n % 2 === 0) {
            queueMicrotask(() => broadcastRef.current?.({ cropToRoom: true }));
          }
          return next;
        });
      }, 85);
    },
    [dungeon, activeCombat, tokensForMap, partyLeaderId, partyFollowIds, stopPartyMarch],
  );

  const handleTokenDragTo = useCallback(
    (tokenId: string | undefined, wx: number, wy: number) => {
      if (tokenId !== partyLeaderId) followerSnapRef.current = null;
      setBattleTokens((prev) => {
        if (
          partyLeaderId &&
          tokenId === partyLeaderId &&
          partyFollowIds.length > 0 &&
          !followerSnapRef.current
        ) {
          followerSnapRef.current = Object.fromEntries(
            prev
              .filter((t) => t.id && partyFollowIds.includes(t.id))
              .map((t) => [t.id!, { gx: t.gx, gy: t.gy }]),
          );
        }
        return prev.map((t) => (t.id === tokenId ? { ...t, gx: wx, gy: wy } : t));
      });
    },
    [partyLeaderId, partyFollowIds],
  );

  const handleTokenDragEnd = useCallback(
    (p: {
      tokenId: string | undefined;
      worldGx: number;
      worldGy: number;
      startWorldGx: number;
      startWorldGy: number;
      didDrag: boolean;
    }) => {
      if (!p.didDrag) return;
      const dx = p.worldGx - p.startWorldGx;
      const dy = p.worldGy - p.startWorldGy;
      setBattleTokens((prev) => {
        if (!partyLeaderId || p.tokenId !== partyLeaderId || !followerSnapRef.current) {
          followerSnapRef.current = null;
          return prev.map((t) => (t.id === p.tokenId ? { ...t, gx: p.worldGx, gy: p.worldGy } : t));
        }
        const snap = followerSnapRef.current;
        followerSnapRef.current = null;
        return prev.map((t) => {
          if (t.id === p.tokenId) return { ...t, gx: p.worldGx, gy: p.worldGy };
          if (t.id && snap[t.id]) {
            const o = snap[t.id]!;
            return { ...t, gx: o.gx + dx, gy: o.gy + dy };
          }
          return t;
        });
      });
    },
    [partyLeaderId],
  );

  useEffect(() => {
    if (!selectedRoomId || !dungeon?.grid) return;
    broadcastRef.current({ cropToRoom: true });
  }, [selectedRoomId, dungeon]);

  const scatterTokensInRoom = () => {
    if (!room || !activeCombat?.combatants?.length) return;
    const { x, y, w, h } = room;
    const cells: { gx: number; gy: number }[] = [];
    for (let yy = y + 1; yy < y + h - 1; yy++) {
      for (let xx = x + 1; xx < x + w - 1; xx++) {
        cells.push({ gx: xx, gy: yy });
      }
    }
    if (cells.length === 0) return;
    const alive = activeCombat.combatants.filter((c) => c.isAlive);
    const next: BattleToken[] = [];
    alive.forEach((c, i) => {
      const cell = cells[i % cells.length]!;
      next.push({
        gx: cell.gx,
        gy: cell.gy,
        label: c.label.slice(0, 4),
        kind: c.type === "player" ? "player" : "monster",
        id: c.id,
      });
    });
    setBattleTokens(next);
  };

  const launchCombatForRoom = async () => {
    if (!activeSession?.id || !dungeon || !room) return;
    if (activeCombat) return;
    if (partyCharacters.length === 0) {
      setLaunchMsg("Add party members first (use the Party step).");
      return;
    }
    if (roomMonsters.length === 0) {
      setLaunchMsg("No monsters in this room.");
      return;
    }

    setLaunching(true);
    setLaunchMsg(null);
    try {
      const monsterRows = await buildForgeMonsterCombatants(roomMonsters);
      if (monsterRows.length === 0) {
        throw new Error(
          "Could not add monsters from this room (no matching SRD stat blocks). Try regenerating the map in Forge or add foes with Ad-hoc encounter below.",
        );
      }
      const players = partyCharacters.map((char) => {
        const dex = char.computed?.modifiers?.dexterity ?? 0;
        return {
          type: "player" as const,
          characterId: char.id,
          label: char.name,
          initiative: Math.floor(Math.random() * 20) + 1 + dex,
          maxHp: char.maxHp,
          armorClass: char.computed.armorClass,
        };
      });
      await startCombat(
        `Room ${room.id} — ${dungeon.mapName ?? "Encounter"}`,
        [...players, ...monsterRows],
      );
      onPaneChange("combat");
      setLaunchMsg(null);
    } catch (err) {
      setLaunchMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLaunching(false);
    }
  };

  const appendRoomMonstersToActiveCombat = async () => {
    if (!activeSession?.id || !activeCombat || !room) return;
    if (roomMonsters.length === 0) return;
    setLaunching(true);
    setLaunchMsg(null);
    try {
      const monsterRows = await buildForgeMonsterCombatants(roomMonsters);
      if (monsterRows.length === 0) {
        throw new Error(
          "Could not resolve these monsters against the compendium. Check names or regenerate the map in Forge.",
        );
      }
      await appendCombatantsToCombat(monsterRows);
      onPaneChange("combat");
      setLaunchMsg(`Added ${monsterRows.length} monster(s). Use the initiative list to find their turns.`);
      setTimeout(() => setLaunchMsg(null), 5000);
    } catch (err) {
      setLaunchMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLaunching(false);
    }
  };

  const giveMapItemToCharacter = async () => {
    if (mapEntityModal?.kind !== "item" || !activeSession?.id) return;
    const ent = mapEntityModal.ent;
    const ex = typeof ent.x === "number" ? ent.x : mapEntityModal.x;
    const ey = typeof ent.y === "number" ? ent.y : mapEntityModal.y;
    const slug = typeof ent.slug === "string" ? ent.slug.trim() : "";
    const name = typeof ent.name === "string" ? ent.name.trim() : "Item";
    if (!giveCharId) {
      setLaunchMsg("Pick a character to receive the item.");
      return;
    }
    const qty = Math.max(1, giveQty);
    const body = slug
      ? { itemSlug: slug, quantity: qty, notes: "Loot (map)" }
      : { customName: name || "Item", quantity: qty, notes: "Loot (map)" };
    const d = dungeonRef.current;
    if (!d) return;
    setMapActionBusy(true);
    setLaunchMsg(null);
    try {
      await characterApi.addItem(giveCharId, body);
      await loadPartyChars();
      const next = removeEntityAtXY(d, ex, ey);
      if (!next) {
        setLaunchMsg("Item was added, but the map snapshot could not be updated (tile mismatch).");
        setMapEntityModal(null);
        return;
      }
      await persistDungeonSnapshot(next);
      setMapEntityModal(null);
    } catch (e) {
      setLaunchMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setMapActionBusy(false);
    }
  };

  const removeMapMonsterTile = async () => {
    if (mapEntityModal?.kind !== "monster" || !activeSession?.id) return;
    const ent = mapEntityModal.ent;
    const ex = typeof ent.x === "number" ? ent.x : mapEntityModal.x;
    const ey = typeof ent.y === "number" ? ent.y : mapEntityModal.y;
    const d = dungeonRef.current;
    if (!d) return;
    setMapActionBusy(true);
    setLaunchMsg(null);
    try {
      const next = removeEntityAtXY(d, ex, ey);
      if (!next) {
        setLaunchMsg("Could not find that creature on the map.");
        setMapEntityModal(null);
        return;
      }
      await persistDungeonSnapshot(next);
      setMapEntityModal(null);
    } catch (e) {
      setLaunchMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setMapActionBusy(false);
    }
  };

  return (
    <>
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 lg:grid-cols-[1.4fr_1fr_0.9fr]">
      <div className="dnd-card flex min-h-0 flex-col overflow-hidden">
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>
            {dungeon?.mapName ?? "Dungeon"} · select a room to zoom; use Full map to see everything{" "}
            {placementCombatantId ? "(placing token)" : ""}
          </span>
          {dungeon && renderGrid && (
            <>
              <label className="flex cursor-pointer items-center gap-1">
                <input
                  type="checkbox"
                  checked={sceneLighting}
                  onChange={(e) => setSceneLighting(e.target.checked)}
                  className="rounded border-gray-600"
                />
                Torch / room lights
              </label>
              <label className="flex cursor-pointer items-center gap-1" title="Move over the map to show a red dot on the player TV page">
                <input
                  type="checkbox"
                  checked={laserPointerMode}
                  onChange={(e) => setLaserPointerMode(e.target.checked)}
                  className="rounded border-gray-600"
                />
                Laser for TV
              </label>
              {room && (
                <>
                  {!showFullMap ? (
                    <button
                      type="button"
                      onClick={() => setShowFullMap(true)}
                      className="rounded border border-gray-600 px-2 py-0.5 text-gray-300 hover:bg-gray-800"
                    >
                      Full map
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowFullMap(false)}
                      className="rounded border border-dnd-gold/50 px-2 py-0.5 text-dnd-gold hover:bg-dnd-gold/10"
                    >
                      Zoom to room
                    </button>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => void syncPlayerTv()}
                className="rounded border border-dnd-gold/60 px-2 py-0.5 text-dnd-gold hover:bg-dnd-gold/10"
                title="Push fog, lights, and tokens to the player TV (crops to selected room if any)"
              >
                Sync this view to TV
              </button>
              <button
                type="button"
                onClick={() => void syncPlayerTvFullFog()}
                className="rounded border border-gray-600 px-2 py-0.5 text-gray-300 hover:bg-gray-800"
                title="Send the whole dungeon with fog of war — no room crop"
              >
                Sync full map (fog)
              </button>
              <span className="text-gray-600">|</span>
              <span className="text-gray-500">Zoom</span>
              <button
                type="button"
                className="rounded border border-gray-600 px-1.5 py-0.5 text-gray-300 hover:bg-gray-800"
                aria-label="Zoom out"
                onClick={() => setDmMapZoom((z) => Math.max(0.35, Math.round((z - 0.1) * 10) / 10))}
              >
                −
              </button>
              <span className="tabular-nums text-gray-400">{Math.round(dmMapZoom * 100)}%</span>
              <button
                type="button"
                className="rounded border border-gray-600 px-1.5 py-0.5 text-gray-300 hover:bg-gray-800"
                aria-label="Zoom in"
                onClick={() => setDmMapZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))}
              >
                +
              </button>
              <button
                type="button"
                className="rounded border border-gray-700 px-1.5 py-0.5 text-gray-400 hover:bg-gray-800"
                onClick={() => setDmMapZoom(1)}
              >
                Reset
              </button>
            </>
          )}
        </div>
        {activeCombat && room && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
            <span className="text-gray-500">Tokens:</span>
            <button type="button" className="btn-ghost min-h-0 px-2 py-0.5 text-xs" onClick={() => void scatterTokensInRoom()}>
              Scatter in room
            </button>
            <select
              className="input-field max-w-[10rem] py-0.5 text-xs"
              value={placementCombatantId ?? ""}
              onChange={(e) => setPlacementCombatantId(e.target.value || null)}
            >
              <option value="">Place token…</option>
              {activeCombat.combatants
                .filter((c) => c.isAlive)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </select>
            {placementCombatantId && (
              <button type="button" className="text-amber-200/90 underline" onClick={() => setPlacementCombatantId(null)}>
                cancel
              </button>
            )}
          </div>
        )}
        {activeCombat && room && (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-800 pt-2 text-[11px] text-gray-400">
            <label className="flex cursor-pointer items-center gap-1">
              <input
                type="checkbox"
                checked={partyMarchMode}
                onChange={(e) => {
                  setPartyMarchMode(e.target.checked);
                  if (e.target.checked) setPlacementCombatantId(null);
                }}
                className="rounded border-gray-600"
              />
              Party march
            </label>
            <span title="Click a walkable floor tile; party moves step-by-step. Pan with scrollbars.">
              (click floor)
            </span>
            <span className="text-gray-600">|</span>
            <span>Leader</span>
            <select
              className="input-field max-w-[9rem] py-0.5 text-xs"
              value={partyLeaderId ?? ""}
              onChange={(e) => setPartyLeaderId(e.target.value || null)}
            >
              <option value="">— none —</option>
              {playerCombatants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <span>Follow:</span>
            {playerCombatants
              .filter((c) => c.id !== partyLeaderId)
              .map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-0.5">
                  <input
                    type="checkbox"
                    className="rounded border-gray-600"
                    checked={partyFollowIds.includes(c.id)}
                    onChange={(e) =>
                      setPartyFollowIds((prev) =>
                        e.target.checked ? [...prev, c.id] : prev.filter((id) => id !== c.id),
                      )
                    }
                  />
                  {c.label}
                </label>
              ))}
            <span
              className="text-gray-500"
              title="Set a leader: player TV crops around them and follows when they move. Fog uses each PC’s race/features for sight."
            >
              TV follows leader · drag empty map to pan when zoomed
            </span>
          </div>
        )}
        <div
          ref={mapViewportRef}
          data-dm-map-viewport
          className={clsx(
            "relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-1",
            partyMarchMode && "ring-1 ring-dnd-gold/30",
          )}
        >
          {dungeon && renderGrid && displayGrid ? (
            <DungeonMapCanvas
              grid={displayGrid}
              cellPx={zoomedDmCellPx}
              palette={palette}
              entities={ENTITY_PALETTE}
              highlightRoom={null}
              worldOffset={worldOffset}
              animPhase={animPhase}
              sceneLights={sceneLightsLocal}
              battleTokens={tokensLocal.length ? tokensLocal : undefined}
              playerSightRingCells={PLAYER_SIGHT_RING_CELLS}
              tokenDragEnabled={!!activeCombat && !laserPointerMode && !partyMarchMode}
              suppressTokenInteraction={laserPointerMode}
              onTokenDragTo={handleTokenDragTo}
              onTokenDragEnd={handleTokenDragEnd}
              onTokensAtCell={
                laserPointerMode
                  ? undefined
                  : (p) => {
                      if (!p || p.tokensHere.length === 0) setTokenHoverTip(null);
                      else
                        setTokenHoverTip({
                          tokens: p.tokensHere,
                          clientX: p.clientX,
                          clientY: p.clientY,
                        });
                    }
              }
              mapPanEnabled={!laserPointerMode}
              style={laserPointerMode ? { cursor: "crosshair" } : partyMarchMode ? { cursor: "cell" } : undefined}
              onCellHover={
                laserPointerMode
                  ? (hx, hy) => {
                      if (hx < 0 || hy < 0) broadcastLaserPointer(null);
                      else sendLaserHover(hx, hy);
                    }
                  : undefined
              }
              onCellClick={(gx, gy, cell: RenderCell) => {
                if (partyMarchMode && activeCombat && dungeon?.grid) {
                  const tile = (dungeon.grid as number[][])[gy]?.[gx];
                  if (isDungeonGridWalkable(tile)) startPartyMarch(gx, gy);
                  return;
                }
                if (placementCombatantId && activeCombat) {
                  const c = activeCombat.combatants.find((x) => x.id === placementCombatantId);
                  if (c?.isAlive) {
                    setBattleTokens((prev) => {
                      const rest = prev.filter((t) => t.id !== c.id);
                      return [
                        ...rest,
                        {
                          gx,
                          gy,
                          label: c.label.slice(0, 4),
                          kind: c.type === "player" ? "player" : "monster",
                          id: c.id,
                        },
                      ];
                    });
                    setPlacementCombatantId(null);
                    return;
                  }
                }
                if (cell.eType === "item" && cell.extra && typeof cell.extra === "object") {
                  setMapEntityModal({
                    kind: "item",
                    x: gx,
                    y: gy,
                    ent: cell.extra as Record<string, unknown>,
                  });
                  return;
                }
                if (cell.eType === "monster" && cell.extra && typeof cell.extra === "object") {
                  setMapEntityModal({
                    kind: "monster",
                    x: gx,
                    y: gy,
                    ent: cell.extra as Record<string, unknown>,
                  });
                  return;
                }
                if (cell.eType === "riddle" && cell.extra && typeof cell.extra === "object") {
                  setMapEntityModal({
                    kind: "riddle",
                    x: gx,
                    y: gy,
                    ent: cell.extra as Record<string, unknown>,
                  });
                  return;
                }
                const r = dungeon.rooms.find(
                  (rm: { x: number; y: number; w: number; h: number; id: number }) =>
                    gx >= rm.x && gx < rm.x + rm.w && gy >= rm.y && gy < rm.y + rm.h,
                );
                if (r) setSelectedRoomId((prev) => (prev === r.id ? null : r.id));
              }}
            />
          ) : dungeon && Array.isArray(dungeon.rooms) && dungeon.rooms.length > 0 ? (
            <p className="text-sm italic text-amber-200/90">
              Map tiles could not be rebuilt (older save). Open{" "}
              <span className="font-semibold text-dnd-gold">Map Library</span>, select this session, and click{" "}
              <span className="font-semibold">SEND TO SESSION</span> again to refresh the snapshot.
            </p>
          ) : (
            <p className="text-sm italic text-gray-500">
              No dungeon snapshot yet — use the Map step to send a map to this session.
            </p>
          )}
        </div>
        {tokenHoverTip && tokenHoverTip.tokens.length > 0 && !laserPointerMode && (
          <div
            className="pointer-events-none fixed z-[200] max-w-[16rem] rounded border border-dnd-gold/35 bg-gray-950/95 px-2 py-1.5 text-[11px] leading-snug text-gray-100 shadow-xl"
            style={{
              left: Math.min(
                tokenHoverTip.clientX + 14,
                (typeof window !== "undefined" ? window.innerWidth : 1200) - 16,
              ),
              top: tokenHoverTip.clientY + 14,
            }}
          >
            {tokenHoverTip.tokens.map((t) => {
              const c = t.id ? activeCombat?.combatants.find((x) => x.id === t.id) : null;
              const role = t.kind === "player" ? "PC" : "Foe";
              const line = c ? `${c.label} · ${role}` : `${t.label || "?"} · ${role}`;
              return <div key={t.id ?? `${t.gx}-${t.gy}-${t.label}`}>{line}</div>;
            })}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1 text-xs">
          {(dungeon?.rooms ?? []).map(
            (r: { id: number; label?: string; type?: string; isSecretRoom?: boolean }) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelectedRoomId((prev) => (prev === r.id ? null : r.id))}
                className={clsx(
                  "rounded border px-2 py-0.5",
                  selectedRoomId === r.id
                    ? "border-dnd-gold text-dnd-gold"
                    : "border-gray-700 text-gray-400",
                  r.isSecretRoom && "border-cyan-600/80 text-cyan-200/90",
                )}
                title={r.isSecretRoom ? "Marked as a secret room on this map" : undefined}
              >
                {r.isSecretRoom ? "★ " : ""}
                {r.id}. {r.label || r.type}
              </button>
            ),
          )}
        </div>
      </div>

      <div className="dnd-card flex min-h-0 flex-col gap-3 overflow-auto">
        <div className="flex gap-1 lg:hidden">
          {(["combat", "rolls"] as WorkspacePane[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPaneChange(p)}
              className={clsx(
                "rounded px-3 py-1 text-sm capitalize",
                pane === p ? "bg-dnd-red text-white" : "bg-gray-800 text-gray-400",
              )}
            >
              {p === "rolls" ? "Rolls" : "Combat"}
            </button>
          ))}
        </div>

        {!room ? (
          <p className="text-sm italic text-gray-500">Select a room on the map to view encounter details.</p>
        ) : (
          <>
            <div>
              <h3 className="font-display font-bold text-dnd-gold">
                {(room as { isSecretRoom?: boolean }).isSecretRoom ? (
                  <span className="mr-2 rounded border border-cyan-500/60 bg-cyan-950/40 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-cyan-200">
                    Secret room
                  </span>
                ) : null}
                {room.namedRoom || `Room ${room.id}`} — {room.label || room.type}
              </h3>
              {(room as { secretHint?: string | null }).secretHint ? (
                <p className="mt-1 text-xs text-cyan-200/90">
                  Secret clue (DM): {(room as { secretHint?: string }).secretHint}
                </p>
              ) : null}
              <p className="text-xs text-gray-500">
                {room.w}×{room.h} · {roomEntities.length} entities
              </p>
              {roomEntities.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-gray-400">
                  {roomEntities.map(
                    (
                      e: {
                        type?: string;
                        name?: string;
                        count?: number;
                        detectDC?: number;
                        saveDC?: number;
                        saveType?: string;
                        dmg?: string;
                        effect?: string;
                        prompt?: string;
                        answer?: string;
                        rewardName?: string;
                        rewardSlug?: string;
                        slug?: string;
                      },
                      i: number,
                    ) => (
                      <li key={i}>
                        <span className="font-semibold capitalize text-gray-300">{e.type ?? "?"}</span>
                        {e.name ? `: ${e.name}` : ""}
                        {e.type === "monster" && (e.count ?? 1) > 1 ? ` ×${e.count}` : ""}
                        {e.slug && e.type === "item" ? (
                          <span className="text-gray-500"> [{e.slug}]</span>
                        ) : null}
                        {e.type === "trap" ? (
                          <span className="mt-0.5 block pl-1 text-[11px] leading-snug text-gray-500">
                            Spot DC {e.detectDC ?? "—"} · {e.saveType || "?"} DC {e.saveDC ?? "—"}
                            {e.dmg ? ` · ${e.dmg}` : ""}
                            {e.effect ? ` — ${e.effect}` : ""}
                          </span>
                        ) : null}
                        {e.type === "riddle" ? (
                          <span className="mt-0.5 block pl-1 text-[11px] leading-snug text-purple-200/95">
                            <span className="font-semibold text-purple-300/90">Q:</span> {e.prompt ?? ""}
                            <span className="mt-0.5 block text-purple-200/80">
                              <span className="font-semibold">Answer (DM):</span> {e.answer ?? ""}
                            </span>
                            {(e.rewardName || e.rewardSlug) && (
                              <span className="mt-0.5 block text-dnd-gold/90">
                                If solved: {e.rewardName ?? e.rewardSlug}
                                {e.rewardSlug ? ` [${e.rewardSlug}]` : ""}
                              </span>
                            )}
                          </span>
                        ) : null}
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
            {roomMonsters.length === 0 && (
              <div className="text-xs italic text-gray-500">No monsters scripted for this room.</div>
            )}
            {roomMonsters.length > 0 && !activeCombat && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500">
                  Starts a new encounter with your party and every monster listed for this room.
                </p>
                <button
                  type="button"
                  onClick={() => void launchCombatForRoom()}
                  disabled={launching}
                  className={clsx(
                    "btn-primary flex items-center gap-2",
                    launching && "opacity-60",
                  )}
                >
                  <Sword size={14} />{" "}
                  {launching
                    ? "Starting…"
                    : `Start combat (${roomMonsters.reduce((a: number, m: { count?: number }) => a + (m.count || 1), 0)} monsters)`}
                </button>
              </div>
            )}
            {roomMonsters.length > 0 && activeCombat && (
              <div className="space-y-1">
                <p className="text-xs text-gray-500">
                  A fight is already running. Add this room&apos;s creatures to the same initiative list (e.g. after
                  you started with Ad-hoc or players only).
                </p>
                <button
                  type="button"
                  onClick={() => void appendRoomMonstersToActiveCombat()}
                  disabled={launching}
                  className={clsx(
                    "btn-primary flex items-center gap-2",
                    launching && "opacity-60",
                  )}
                >
                  <Sword size={14} />{" "}
                  {launching
                    ? "Adding…"
                    : `Add room monsters to this combat (${roomMonsters.reduce((a: number, m: { count?: number }) => a + (m.count || 1), 0)})`}
                </button>
              </div>
            )}
            {launchMsg && <div className="text-xs text-amber-200/90">{launchMsg}</div>}

            {activeCombat && (
              <div
                className={clsx(
                  "min-h-0 flex-1",
                  pane === "combat" ? "block" : "hidden",
                  "lg:block",
                )}
              >
                <InlineCombatPanel />
              </div>
            )}
            {activeCombat && (
              <div className={clsx(pane === "rolls" ? "block" : "hidden", "lg:hidden")}>
                <InlineRollHelper />
              </div>
            )}
            {!activeCombat && (
              <div className="mt-2 border-t border-gray-800 pt-3">
                <p className="dnd-label mb-2">Ad-hoc encounter</p>
                <StartCombatPanel />
              </div>
            )}
          </>
        )}
      </div>

      <div className="dnd-card hidden min-h-0 flex-col overflow-auto lg:flex">
        <InlineRollHelper />
      </div>
    </div>

    {mapEntityModal?.kind === "item" && (
      <Modal
        title={`Loot: ${String(mapEntityModal.ent.name ?? "Item")}`}
        onClose={() => !mapActionBusy && setMapEntityModal(null)}
        footer={
          <>
            <button
              type="button"
              onClick={() => !mapActionBusy && setMapEntityModal(null)}
              className="btn-secondary"
              disabled={mapActionBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void giveMapItemToCharacter()}
              disabled={mapActionBusy || partyCharacters.length === 0}
              className="btn-primary"
            >
              {mapActionBusy ? "Saving…" : "Add to stash & remove from map"}
            </button>
          </>
        }
      >
        {partyCharacters.length === 0 ? (
          <p className="text-sm text-amber-200/90">Add party members on the Party step first.</p>
        ) : (
          <div className="space-y-3">
            <label className="block text-xs text-gray-500">
              Character
              <select
                className="input-field mt-1 w-full"
                value={giveCharId}
                onChange={(e) => setGiveCharId(e.target.value)}
                disabled={mapActionBusy}
              >
                {partyCharacters.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    {ch.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-gray-500">
              Quantity
              <input
                type="number"
                min={1}
                className="input-field mt-1 w-24"
                value={giveQty}
                onChange={(e) => setGiveQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                disabled={mapActionBusy}
              />
            </label>
            <p className="text-xs text-gray-500">
              The item is removed from this session&apos;s map snapshot so it no longer shows here or on the synced
              player view after you sync.
            </p>
          </div>
        )}
      </Modal>
    )}

    {mapEntityModal?.kind === "monster" && (
      <Modal
        title={`Creature: ${String(mapEntityModal.ent.name ?? "Monster")}`}
        onClose={() => !mapActionBusy && setMapEntityModal(null)}
        footer={
          <>
            <button
              type="button"
              onClick={() => !mapActionBusy && setMapEntityModal(null)}
              className="btn-secondary"
              disabled={mapActionBusy}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void removeMapMonsterTile()}
              disabled={mapActionBusy}
              className="btn-primary"
            >
              {mapActionBusy ? "Saving…" : "Remove from map"}
            </button>
          </>
        }
      >
        <p className="text-sm text-gray-400">
          Removes this scripted creature from the session map (for example after you resolved it without combat, or
          as a handout). If you are using combat, tokens also clear from the map when a foe&apos;s HP hits 0.
        </p>
      </Modal>
    )}

    {mapEntityModal?.kind === "riddle" && (
      <Modal
        title="Riddle (DM only)"
        onClose={() => setMapEntityModal(null)}
        footer={
          <button type="button" onClick={() => setMapEntityModal(null)} className="btn-primary">
            Close
          </button>
        }
      >
        <p className="text-sm text-gray-200">{String(mapEntityModal.ent.prompt ?? "")}</p>
        <p className="mt-3 text-sm text-purple-200/90">
          <span className="font-semibold text-purple-300">Answer:</span> {String(mapEntityModal.ent.answer ?? "")}
        </p>
        {(Boolean(mapEntityModal.ent.rewardName) || Boolean(mapEntityModal.ent.rewardSlug)) && (
          <p className="mt-2 text-sm text-dnd-gold/90">
            Suggested treasure if solved: {String(mapEntityModal.ent.rewardName ?? mapEntityModal.ent.rewardSlug ?? "")}
            {mapEntityModal.ent.rewardSlug ? ` [${String(mapEntityModal.ent.rewardSlug)}]` : ""}
          </p>
        )}
        <p className="mt-3 text-xs text-gray-500">
          This marker is hidden on the player map. Read the prompt aloud; keep the answer to yourself.
        </p>
      </Modal>
    )}
    </>
  );
}

// ── Start Combat Panel ────────────────────────────────────────────
function StartCombatPanel() {
  const { partyCharacters, startCombat } = useSessionStore();
  const [combatName, setCombatName] = useState("Encounter 1");
  const [initiatives, setInitiatives] = useState<Record<string, number>>({});
  const [monsters, setMonsters] = useState<
    { slug: string; label: string; hp: number; ac: number; initiative: number }[]
  >([]);
  const [monsterSearch, setMonsterSearch] = useState("");
  const [monsterResults, setMonsterResults] = useState<any[]>([]);

  const searchMonsters = async () => {
    const res = await fetch(`/api/monsters?search=${encodeURIComponent(monsterSearch)}`);
    const data = await res.json();
    setMonsterResults(data.slice(0, 10));
  };

  const addMonster = (m: any, count = 1) => {
    for (let i = 1; i <= count; i++) {
      setMonsters((prev) => [
        ...prev,
        {
          slug: m.slug,
          label: `${m.name}${count > 1 ? ` ${i}` : ""}`,
          hp: m.hitPoints,
          ac: m.armorClass,
          initiative: Math.floor(Math.random() * 20) + 1,
        },
      ]);
    }
  };

  const autoRollPlayerInitiatives = () => {
    const next: Record<string, number> = {};
    for (const char of partyCharacters) {
      const dex = char.computed?.modifiers?.dexterity ?? 0;
      next[char.id] = Math.floor(Math.random() * 20) + 1 + dex;
    }
    setInitiatives(next);
  };

  const handleStart = async () => {
    const combatants = [
      ...partyCharacters.map((char) => ({
        type: "player" as const,
        characterId: char.id,
        label: char.name,
        initiative: initiatives[char.id] ?? 10,
        maxHp: char.maxHp,
        armorClass: char.computed.armorClass,
      })),
      ...monsters.map((m) => ({
        type: "monster" as const,
        monsterSlug: m.slug,
        label: m.label,
        initiative: m.initiative,
        maxHp: m.hp,
        armorClass: m.ac,
      })),
    ];
    await startCombat(combatName, combatants);
  };

  return (
    <div className="dnd-card space-y-4">
      <h3 className="font-display font-bold text-dnd-gold">Start Combat</h3>
      <input
        type="text"
        value={combatName}
        onChange={(e) => setCombatName(e.target.value)}
        className="input-field w-full text-sm"
        placeholder="Combat name"
        spellCheck
      />

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="dnd-label">Player Initiatives (roll d20 + DEX mod)</p>
          <button type="button" onClick={autoRollPlayerInitiatives} className="btn-ghost min-h-0 px-2 py-1 text-xs">
            Auto-roll all
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {partyCharacters.map((char) => (
            <div key={char.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-gray-300">{char.name}</span>
              <span className="text-xs text-gray-600">{formatModifier(char.computed.modifiers.dexterity)}</span>
              <input
                type="number"
                className="input-field w-16 text-center text-sm"
                value={initiatives[char.id] ?? ""}
                onChange={(e) =>
                  setInitiatives((p) => ({ ...p, [char.id]: parseInt(e.target.value, 10) || 0 }))
                }
                placeholder="20"
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="dnd-label mb-2">Add Monsters</p>
        <div className="mb-2 flex gap-2">
          <input
            type="text"
            value={monsterSearch}
            onChange={(e) => setMonsterSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void searchMonsters()}
            className="input-field flex-1 text-sm"
            placeholder="Search monsters..."
            spellCheck={false}
          />
          <button type="button" onClick={() => void searchMonsters()} className="btn-secondary text-sm">
            Search
          </button>
        </div>
        {monsterResults.length > 0 && (
          <div className="max-h-40 space-y-1 overflow-auto">
            {monsterResults.map((m) => (
              <div
                key={m.slug}
                className="flex items-center justify-between rounded px-2 py-1 hover:bg-gray-800"
              >
                <span className="text-sm text-white">{m.name}</span>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span>CR {m.challengeRating}</span>
                  <span>{m.hitPoints} HP</span>
                  <span>AC {m.armorClass}</span>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => addMonster(m, n)}
                      className="h-6 w-6 rounded bg-gray-700 text-xs transition-colors hover:bg-dnd-red"
                    >
                      ×{n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {monsters.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="mb-1 flex items-center justify-between">
              <span className="dnd-label">Selected Monsters ({monsters.length})</span>
              <button
                type="button"
                onClick={() => setMonsters([])}
                className="btn-ghost min-h-0 px-2 py-1 text-xs text-red-300 hover:text-red-200"
              >
                Clear all
              </button>
            </div>
            {monsters.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="flex-1 text-red-300">{m.label}</span>
                <span className="text-gray-500">
                  {m.hp} HP · AC {m.ac}
                </span>
                <input
                  type="number"
                  className="input-field w-16 text-center text-xs"
                  value={m.initiative}
                  onChange={(e) =>
                    setMonsters((prev) =>
                      prev.map((x, j) =>
                        j === i ? { ...x, initiative: parseInt(e.target.value, 10) || 0 } : x,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => setMonsters((p) => p.filter((_, j) => j !== i))}
                  className="text-gray-600 hover:text-red-400"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <button type="button" onClick={() => void handleStart()} className="btn-primary flex w-full items-center justify-center gap-2">
        <Sword size={16} /> Start Combat
      </button>
    </div>
  );
}

// ── Inline combat (was Combat tab) ──────────────────────────────
function InlineCombatPanel() {
  const { activeCombat, nextRound, endCombat, damageCombatant, healCombatant, updateCombatant } =
    useSessionStore();
  const [dmgInputs, setDmgInputs] = useState<Record<string, string>>({});
  const [selectedCombatantId, setSelectedCombatantId] = useState<string | null>(null);
  const [collapsedMonsterGroups, setCollapsedMonsterGroups] = useState<Record<string, boolean>>({});

  const sorted = activeCombat
    ? [...activeCombat.combatants].sort((a, b) => b.initiative - a.initiative)
    : [];
  const alive = sorted.filter((c) => c.isAlive);
  const alivePlayers = alive.filter((c) => c.type === "player").length;
  const aliveMonsters = alive.filter((c) => c.type === "monster").length;
  const current = sorted[0] ?? null;
  const selectedCombatant = sorted.find((c) => c.id === selectedCombatantId) ?? null;

  const groupKeyFor = (c: Combatant) => {
    if (c.type !== "monster") return null;
    if (c.monsterSlug) return `slug:${c.monsterSlug}`;
    const normalized = c.label.replace(/\s+\d+$/, "").trim().toLowerCase();
    return `label:${normalized}`;
  };

  useEffect(() => {
    if (!activeCombat || !current) return;
    setSelectedCombatantId((prev) => prev ?? current.id);
  }, [activeCombat, current?.id]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inEditable =
        !!target &&
        (target.isContentEditable || tag === "input" || tag === "textarea" || tag === "select");
      if (inEditable) return;
      if (!selectedCombatant) return;

      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        void nextRound();
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        void damageCombatant(selectedCombatant.id, 5);
        return;
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        void healCombatant(selectedCombatant.id, 5);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCombatant, nextRound, damageCombatant, healCombatant]);

  if (!activeCombat) return null;

  return (
    <div className="w-full space-y-4">
      <div className="sticky top-0 z-20 space-y-3 bg-dnd-darker/90 py-2 backdrop-blur-sm">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="dnd-card px-3 py-2">
            <p className="dnd-label">Current Turn</p>
            <p className="truncate font-display text-sm text-white">{current?.label ?? "—"}</p>
          </div>
          <div className="dnd-card px-3 py-2">
            <p className="dnd-label">Players Alive</p>
            <p className="font-display text-sm text-blue-300">{alivePlayers}</p>
          </div>
          <div className="dnd-card px-3 py-2">
            <p className="dnd-label">Monsters Alive</p>
            <p className="font-display text-sm text-red-300">{aliveMonsters}</p>
          </div>
        </div>

        <div className="dnd-card flex items-center justify-between">
          <div>
            <span className="dnd-label">Round</span>
            <span className="ml-3 font-display text-3xl font-bold text-dnd-gold">{activeCombat.round}</span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => void nextRound()} className="btn-primary flex items-center gap-2">
              <SkipForward size={15} /> Next Round
            </button>
            <button type="button" onClick={() => void endCombat()} className="btn-secondary flex items-center gap-2 text-sm">
              End Combat
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map((c, idx) => {
          const gk = groupKeyFor(c);
          const prev = idx > 0 ? sorted[idx - 1] : null;
          const prevGk = prev ? groupKeyFor(prev) : null;
          const firstInGroup = gk !== null && gk !== prevGk;
          const groupMembers = gk ? sorted.filter((x) => groupKeyFor(x) === gk) : [];
          const collapsed = gk ? !!collapsedMonsterGroups[gk] : false;

          if (gk && !firstInGroup && collapsed) return null;

          return (
            <div key={c.id} className="space-y-1">
              {firstInGroup && groupMembers.length > 1 && (
                <button
                  type="button"
                  onClick={() => setCollapsedMonsterGroups((p) => ({ ...p, [gk]: !collapsed }))}
                  className="w-full rounded border border-gray-800 bg-dnd-dark px-2 py-1 text-left text-xs text-gray-400 hover:text-gray-200"
                >
                  {collapsed ? "▶" : "▼"} {c.monsterSlug ?? c.label.replace(/\s+\d+$/, "")} (
                  {groupMembers.length})
                </button>
              )}
              {collapsed && firstInGroup ? null : (
                <CombatantRow
                  combatant={c}
                  isFirst={idx === 0}
                  isSelected={selectedCombatantId === c.id}
                  onSelect={() => setSelectedCombatantId(c.id)}
                  dmgInput={dmgInputs[c.id] ?? ""}
                  onDmgChange={(v) => setDmgInputs((p) => ({ ...p, [c.id]: v }))}
                  onDamage={(forcedAmount) => {
                    const amount = forcedAmount ?? (parseInt(dmgInputs[c.id] ?? "0", 10) || 0);
                    if (amount <= 0) return;
                    void damageCombatant(c.id, amount);
                    setDmgInputs((p) => ({ ...p, [c.id]: "" }));
                  }}
                  onHeal={(forcedAmount) => {
                    const amount = forcedAmount ?? (parseInt(dmgInputs[c.id] ?? "0", 10) || 0);
                    if (amount <= 0) return;
                    void healCombatant(c.id, amount);
                    setDmgInputs((p) => ({ ...p, [c.id]: "" }));
                  }}
                  onToggleCondition={(cond) => {
                    const has = c.conditions.includes(cond);
                    void updateCombatant(c.id, {
                      conditions: has ? c.conditions.filter((x) => x !== cond) : [...c.conditions, cond],
                    });
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CombatantRow({
  combatant: c,
  isFirst,
  isSelected,
  onSelect,
  dmgInput,
  onDmgChange,
  onDamage,
  onHeal,
  onToggleCondition,
}: {
  combatant: Combatant;
  isFirst: boolean;
  isSelected: boolean;
  onSelect: () => void;
  dmgInput: string;
  onDmgChange: (v: string) => void;
  onDamage: (amount?: number) => void;
  onHeal: (amount?: number) => void;
  onToggleCondition: (c: string) => void;
}) {
  const [expanded, setExpanded] = useState(isFirst);
  const hpPct = Math.round((c.currentHp / c.maxHp) * 100);
  const CONDITIONS = [
    "blinded",
    "charmed",
    "frightened",
    "grappled",
    "incapacitated",
    "paralyzed",
    "poisoned",
    "prone",
    "restrained",
    "stunned",
  ];
  const amount = parseInt(dmgInput || "0", 10) || 0;
  const applyQuickDamage = (n: number) => onDamage(n);
  const applyQuickHeal = (n: number) => onHeal(n);

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-lg border transition-all",
        isFirst ? "border-dnd-gold shadow-[0_0_8px_rgba(212,172,13,0.2)]" : "border-gray-700",
        isSelected && "ring-1 ring-blue-500/40",
        !c.isAlive && "opacity-50",
      )}
      onClick={onSelect}
    >
      <div
        className={clsx(
          "flex items-center gap-3 px-3 py-2",
          isFirst ? "bg-dnd-dark/90 ring-1 ring-dnd-gold/20" : "bg-dnd-dark",
        )}
      >
        <span
          className={clsx(
            "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full font-display text-sm font-bold",
            c.type === "player" ? "bg-blue-900 text-blue-200" : "bg-red-900 text-red-200",
          )}
        >
          {c.initiative}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-display font-bold text-white">{c.label}</span>
            {c.type === "monster" && <Skull size={12} className="flex-shrink-0 text-red-400" />}
            {isFirst && (
              <span className="rounded border border-dnd-gold/40 bg-dnd-gold/20 px-1.5 py-0.5 font-display text-[10px] text-dnd-gold">
                TURN
              </span>
            )}
            {c.isConcentrating && (
              <span title="Concentrating">
                <Zap size={12} className="text-yellow-400" />
              </span>
            )}
            {c.conditions.map((cond) => (
              <span
                key={cond}
                className="rounded border border-red-800 bg-red-950 px-1.5 py-0.5 font-display text-xs text-red-300"
              >
                {cond}
              </span>
            ))}
          </div>
          <HPBar current={c.currentHp} max={c.maxHp} temp={c.temporaryHp} />
        </div>

        <span
          className={clsx(
            "w-20 flex-shrink-0 text-right font-display text-sm font-bold",
            hpPct > 50 ? "text-green-400" : hpPct > 25 ? "text-yellow-400" : "text-red-400",
          )}
        >
          {c.currentHp}/{c.maxHp}
        </span>

        <span className="flex flex-shrink-0 items-center gap-1 text-xs text-gray-500">
          <Shield size={11} />
          {c.armorClass}
        </span>

        <input
          type="number"
          min={0}
          value={dmgInput}
          onChange={(e) => onDmgChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") amount >= 0 && onDamage();
          }}
          className="input-field w-16 flex-shrink-0 text-center text-sm"
          placeholder="amt"
        />
        <button
          type="button"
          onClick={() => onDamage()}
          title="Damage"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded border border-red-800 bg-red-950 text-sm font-bold text-red-300 hover:bg-red-900"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => onHeal()}
          title="Heal"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded border border-green-800 bg-green-950 text-sm font-bold text-green-300 hover:bg-green-900"
        >
          +
        </button>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex-shrink-0 text-gray-500 hover:text-white"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-800 bg-gray-900 px-3 pb-2 pt-1">
          <div className="mb-2 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => applyQuickDamage(1)}
              className="rounded border border-red-900 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950"
            >
              -1
            </button>
            <button
              type="button"
              onClick={() => applyQuickDamage(5)}
              className="rounded border border-red-900 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950"
            >
              -5
            </button>
            <button
              type="button"
              onClick={() => applyQuickDamage(10)}
              className="rounded border border-red-900 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950"
            >
              -10
            </button>
            <button
              type="button"
              onClick={() => applyQuickHeal(5)}
              className="rounded border border-green-900 px-2 py-0.5 text-xs text-green-300 hover:bg-green-950"
            >
              +5
            </button>
            <button
              type="button"
              onClick={() => applyQuickHeal(10)}
              className="rounded border border-green-900 px-2 py-0.5 text-xs text-green-300 hover:bg-green-950"
            >
              +10
            </button>
          </div>
          <p className="dnd-label mb-1">Conditions</p>
          <div className="flex flex-wrap gap-1">
            {CONDITIONS.map((cond) => (
              <button
                key={cond}
                type="button"
                onClick={() => onToggleCondition(cond)}
                className={clsx(
                  "rounded border px-2 py-0.5 font-display text-xs capitalize transition-colors",
                  c.conditions.includes(cond)
                    ? "border-red-700 bg-red-950 text-red-300"
                    : "border-gray-700 text-gray-500 hover:border-gray-500",
                )}
              >
                {cond}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline roll helper ───────────────────────────────────────────
function InlineRollHelper() {
  const { rollSummary, refreshRolls } = useSessionStore();

  useEffect(() => {
    void refreshRolls();
  }, [refreshRolls]);

  if (!rollSummary) return <LoadingSpinner />;

  if (!rollSummary.inCombat) {
    return (
      <div className="py-6 text-center text-sm text-gray-500">
        <p className="font-display text-base">No active combat.</p>
        <p className="mt-1">Start a combat encounter to see roll helpers.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-1">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-blue-400">Players Roll</h2>
          <button type="button" onClick={() => void refreshRolls()} className="text-gray-500 hover:text-white">
            <RefreshCw size={14} />
          </button>
        </div>
        {rollSummary.playerRolls.map((p) => (
          <PlayerRollCard key={p.characterId} info={p} />
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="font-display text-lg font-bold text-red-400">You Roll (DM)</h2>
        {rollSummary.dmRolls.map((d) => (
          <DmRollCard key={d.combatantId} info={d as DmRollInfo} />
        ))}
        {rollSummary.dmRolls.length === 0 && (
          <p className="text-sm italic text-gray-500">No monsters in combat.</p>
        )}
      </div>
    </div>
  );
}

function PlayerRollCard({ info }: { info: PlayerRollInfo }) {
  const hpPct = Math.round((info.currentHp / info.maxHp) * 100);
  return (
    <div className="dnd-card border-blue-900">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display font-bold text-white">{info.characterName}</span>
        <span
          className={clsx(
            "font-display text-sm font-bold",
            hpPct > 50 ? "text-green-400" : hpPct > 25 ? "text-yellow-400" : "text-red-400",
          )}
        >
          {info.currentHp}/{info.maxHp} HP
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <RollLine label="Melee Attack" roll={`d20${formatModifier(info.keyRolls.attacks.melee.bonus)}`} />
        <RollLine label="Ranged Attack" roll={`d20${formatModifier(info.keyRolls.attacks.ranged.bonus)}`} />
        {info.keyRolls.attacks.spell && (
          <RollLine
            label={info.keyRolls.attacks.spell.label}
            roll={`d20${formatModifier(info.keyRolls.attacks.spell.bonus)} | DC ${info.keyRolls.attacks.spell.dc}`}
          />
        )}
        <RollLine label="Perception" roll={String(info.passivePerception)} note="passive" />
        {Object.entries(info.keyRolls.skills).map(([skill, bonus]) => (
          <RollLine
            key={skill}
            label={skill.charAt(0).toUpperCase() + skill.slice(1)}
            roll={`d20${formatModifier(bonus)}`}
          />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 border-t border-gray-700 pt-2 text-xs">
        <p className="dnd-label col-span-2">Saving Throws</p>
        {Object.entries(info.keyRolls.saves).map(([ability, save]) => (
          <RollLine
            key={ability}
            label={ability.slice(0, 3).toUpperCase()}
            roll={`d20${formatModifier(save.bonus)}`}
            note={save.proficient ? "prof" : ""}
          />
        ))}
      </div>
    </div>
  );
}

function DmRollCard({ info }: { info: DmRollInfo }) {
  const { activeCombat } = useSessionStore();
  const hpPct = Math.round((info.currentHp / info.maxHp) * 100);
  const playerTargets =
    activeCombat?.combatants
      .filter((c) => c.type === "player" && c.isAlive)
      .map((c) => ({ id: c.id, label: c.label })) ?? [];

  return (
    <div className="dnd-card border-red-900">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-display font-bold text-white">{info.label}</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-500">AC {info.armorClass}</span>
          <span
            className={clsx(
              "font-display font-bold",
              hpPct > 50 ? "text-green-400" : hpPct > 25 ? "text-yellow-400" : "text-red-400",
            )}
          >
            {info.currentHp}/{info.maxHp} HP
          </span>
        </div>
      </div>
      <div className="space-y-2">
        {info.actions.slice(0, 5).map((action, i) => (
          <DmMonsterActionRow
            key={`${info.combatantId}-${i}-${action.name}`}
            action={action}
            playerTargets={playerTargets}
          />
        ))}
      </div>
    </div>
  );
}

function DmMonsterActionRow({
  action,
  playerTargets,
}: {
  action: DmRollInfo["actions"][number];
  playerTargets: { id: string; label: string }[];
}) {
  const { damageCombatant } = useSessionStore();
  const [attack, setAttack] = useState<AttackRollResult | null>(null);
  const [dmg, setDmg] = useState<DamageRollResult | null>(null);
  const [targetId, setTargetId] = useState<string>(playerTargets[0]?.id ?? "");
  const [dmgInput, setDmgInput] = useState<string>("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    setTargetId(playerTargets[0]?.id ?? "");
  }, [playerTargets]);

  useEffect(() => {
    if (dmg) setDmgInput(String(dmg.total));
  }, [dmg]);

  const canAttack = action.attackBonus !== null && action.attackBonus !== undefined;
  const hasStructuredDamage =
    Boolean((action.damageDice ?? "").trim()) ||
    (action.damageBonus != null && action.damageBonus !== 0);
  const descDice = extractDiceNotation(action.description);
  const canRollDamage = hasStructuredDamage || Boolean(descDice) || canAttack;

  const resolvedDamageDice = (): string | null => {
    const d = (action.damageDice ?? "").trim();
    if (d) return d;
    if (descDice) return descDice;
    return null;
  };

  const runAttack = () => {
    if (!canAttack || action.attackBonus === null) return;
    setAttack(rollAttackVsAc(action.attackBonus));
  };

  const runDamage = () => {
    if (!canRollDamage) return;
    setDmg(rollMonsterDamage(resolvedDamageDice(), action.damageBonus));
  };

  const runAttackAndDamage = () => {
    if (!canAttack || action.attackBonus === null) return;
    setAttack(rollAttackVsAc(action.attackBonus));
    setDmg(rollMonsterDamage(resolvedDamageDice(), action.damageBonus));
  };

  const applyToPlayer = async () => {
    const amt = parseInt(dmgInput, 10);
    if (!targetId || !Number.isFinite(amt) || amt <= 0) return;
    setApplying(true);
    try {
      await damageCombatant(targetId, amt);
    } finally {
      setApplying(false);
    }
  };

  const dmgAmt = parseInt(dmgInput, 10);
  const canApply =
    playerTargets.length > 0 &&
    Boolean(targetId) &&
    Number.isFinite(dmgAmt) &&
    dmgAmt > 0 &&
    !applying;

  return (
    <div className="rounded bg-gray-900 px-2 py-1.5">
      <div className="flex flex-wrap items-start justify-between gap-1">
        <span className="font-display text-xs font-semibold text-white">{action.name}</span>
        <div className="flex max-w-[55%] flex-wrap justify-end gap-x-2 gap-y-0.5 font-mono text-[10px] text-gray-500">
          {canAttack && <span className="text-dnd-gold">d20{formatModifier(action.attackBonus!)}</span>}
          {action.damageDice && (
            <span className="text-red-300/90">
              {action.damageDice}
              {action.damageBonus ? formatModifier(action.damageBonus) : ""}
              {action.damageType ? ` ${action.damageType}` : ""}
            </span>
          )}
          {action.saveDc != null && (
            <span className="text-yellow-400/90">
              DC {action.saveDc} {action.saveType ?? ""}
            </span>
          )}
        </div>
      </div>
      {action.description && (
        <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">{action.description}</p>
      )}

      <div className="mt-1.5 space-y-1.5 border-t border-gray-800 pt-1.5">
        {canAttack && (
          <button
            type="button"
            onClick={runAttackAndDamage}
            className="w-full rounded border border-dnd-gold/50 bg-dnd-gold/10 px-2 py-1 text-[11px] font-semibold text-dnd-gold hover:bg-dnd-gold/20"
          >
            Roll attack + damage
          </button>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {canAttack && (
            <button
              type="button"
              onClick={runAttack}
              className="rounded bg-gray-800 px-2 py-0.5 text-[11px] font-semibold text-dnd-gold hover:bg-gray-700"
            >
              Attack only
            </button>
          )}
          {canRollDamage && (
            <button
              type="button"
              onClick={runDamage}
              className="rounded bg-gray-800 px-2 py-0.5 text-[11px] font-semibold text-red-300 hover:bg-gray-700"
            >
              Damage only
            </button>
          )}
        </div>
        {canAttack && !hasStructuredDamage && !descDice && (
          <p className="text-[10px] text-amber-200/80">
            No damage dice in data — use Damage only after a hit, or type HP below (check the book if needed).
          </p>
        )}
      </div>

      {attack && (
        <p className="mt-1 font-mono text-[11px] text-dnd-gold">
          Hit {attack.total}
          <span className="text-gray-500">
            {" "}
            (d20 {attack.d20}
            {formatModifier(attack.bonus)})
          </span>
          {attack.crit && <span className="ml-1 font-display text-amber-300">CRIT</span>}
          {attack.critFail && <span className="ml-1 text-gray-500">miss?</span>}
        </p>
      )}

      {dmg && (
        <p className="mt-0.5 font-mono text-[11px] text-red-200">
          Damage {dmg.total} — {dmg.breakdown}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-end gap-1.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <label className="dnd-label text-[9px]">Apply HP loss to</label>
          <select
            className="input-field max-w-[10rem] py-0.5 text-[11px]"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            disabled={playerTargets.length === 0}
          >
            {playerTargets.length === 0 ? (
              <option value="">No players in combat</option>
            ) : (
              playerTargets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="dnd-label text-[9px]">Amount</label>
          <input
            type="number"
            min={1}
            className="input-field w-16 py-0.5 text-center text-[11px]"
            value={dmgInput}
            onChange={(e) => setDmgInput(e.target.value)}
            placeholder="0"
          />
        </div>
        <button
          type="button"
          disabled={!canApply}
          onClick={() => void applyToPlayer()}
          className="btn-primary min-h-0 self-end px-2 py-0.5 text-[11px] disabled:opacity-40"
        >
          {applying ? "…" : "Apply damage"}
        </button>
      </div>
      {playerTargets.length === 0 && (
        <p className="mt-1 text-[10px] text-gray-600">No living player combatants to receive damage.</p>
      )}
    </div>
  );
}

function RollLine({ label, roll, note }: { label: string; roll: string; note?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">
        {label}
        {note && <span className="ml-1 text-gray-600">({note})</span>}
      </span>
      <span className="font-mono font-bold text-dnd-gold">{roll}</span>
    </div>
  );
}
