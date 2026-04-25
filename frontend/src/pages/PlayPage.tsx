import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useSessionStore } from "@/store/sessionStore";
import type { Combatant, PlayerRollInfo, DmRollInfo } from "@/store/sessionStore";
import { characterApi } from "@/services/api";
import type { CharacterSummary } from "@/types/dnd";
import { LoadingSpinner, formatModifier, HPBar, Modal } from "@/components/common";
import {
  Plus,
  Sword,
  Shield,
  Zap,
  RefreshCw,
  SkipForward,
  X,
  LogOut,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Skull,
  Copy,
  Paintbrush,
  Flame,
  Crosshair,
  Eye,
} from "lucide-react";
import { clsx } from "clsx";
import DungeonForge from "@/components/dungeon-forge/DungeonForge";
import { DungeonMapCanvas } from "@/components/dungeon-forge/DungeonMapCanvas";

const DungeonForge3D = lazy(() => import("@/components/dungeon-forge/DungeonForge3D"));
import { MonsterStatCard } from "@/components/dungeon-forge/MonsterStatCard";
import { buildRenderGrid, effectiveDungeonGridDims } from "@/lib/dungeonForgeRenderGrid";
import { decrementForgeMonsterBySlug, removeEntityAtXY } from "@/lib/dungeonEntityUpdates";
import { makeSeededRng, pickWallAdjacentFloorCells } from "@/lib/forgeWallLights";
import type { RenderCell } from "@/lib/dungeonTileRenderer";
import { ENTITY_PALETTE, forgePaletteForDungeon } from "@/lib/dungeonTilePalettes";
import {
  cellRoomId,
  computeVisibleCellsForPlayer,
  expandFogWithPlayerTokenVision,
  isDungeonGridWalkable,
  isOpenFloorLocation,
  maxFogHopsForLocationType,
} from "@/lib/dungeonForgeFog";
import { applyPlayerHiddenRevealRules } from "@/lib/dungeonForgePlayerHidden";
import { DUNGEON_T } from "@/lib/dungeonForgeConstants";
import {
  greedyStepToward,
  shortestWalkablePathBfs,
  walkGreedyStepsOnGrid,
} from "@/lib/dungeonGridMovement";
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
import { DM_PLAY_SET_TV_ID, DM_PLAY_SYNC_FULL, DM_PLAY_SYNC_VIEW } from "@/lib/dmPlayTvEvents";

type FlowStep = "map" | "party" | "workspace";
type WorkspacePane = "combat" | "rolls";

const DM_PLAY_SIDEBAR_WIDTH_KEY = "dnd5e-dm-play-sidebar-px";
const DM_PLAY_SIDEBAR_DEFAULT_PX = 380;
const DM_PLAY_SIDEBAR_MIN_PX = 260;

const TV_ID_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;

function collectAllDoorKeysOpen(grid: number[][]): Set<string> {
  const s = new Set<string>();
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    for (let x = 0; x < (row?.length ?? 0); x++) {
      const t = row![x];
      if (
        t === DUNGEON_T.D ||
        t === DUNGEON_T.SECRET_DOOR ||
        t === DUNGEON_T.GATE ||
        t === DUNGEON_T.DRAWBRIDGE
      ) {
        s.add(`${x},${y}`);
      }
    }
  }
  return s;
}

function toggleDoorOpenState(grid: number[][], prev: Set<string> | null, key: string): Set<string> {
  const base = prev === null ? collectAllDoorKeysOpen(grid) : new Set(prev);
  if (base.has(key)) base.delete(key);
  else base.add(key);
  return base;
}

function isDoorTile(t: number | undefined): boolean {
  if (t === undefined) return false;
  return (
    t === DUNGEON_T.D ||
    t === DUNGEON_T.SECRET_DOOR ||
    t === DUNGEON_T.GATE ||
    t === DUNGEON_T.DRAWBRIDGE
  );
}

function DmPlayTvSyncPanel({
  tvId,
  onTvIdChange,
  onApplyTvId,
  onSyncView,
  onSyncFull,
  busy,
  status,
  layout = "full",
}: {
  tvId: string;
  onTvIdChange: (v: string) => void;
  onApplyTvId: () => void;
  onSyncView: () => void;
  onSyncFull: () => void;
  busy: boolean;
  status: string | null;
  layout?: "full" | "compact";
}) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const localUrl = `${origin}/dungeons/player`;
  const tvUrl = `${origin}/dungeons/player?tv=${encodeURIComponent(tvId.trim() || "1")}`;

  const copyText = useCallback(async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt(`Copy ${label}:`, text);
    }
  }, []);

  const tvOk = TV_ID_PATTERN.test(tvId.trim());

  return (
    <div
      className={clsx(
        "mb-2 rounded border border-dnd-gold/25 bg-black/50 px-2 py-2 text-[10px] leading-snug text-gray-400",
        layout === "compact" && "max-w-lg",
      )}
    >
      <div className="font-display text-[11px] font-semibold text-dnd-gold/90">Player map &amp; TV sync</div>
      {layout === "full" && (
        <p className="mt-1 text-gray-500">
          Enter the same TV number as in your projector URL (<code className="text-gray-400">?tv=…</code>), then sync. Fog
          follows PC tokens, doors, and your paintbrush seeds below.
        </p>
      )}
      {layout === "compact" && (
        <p className="mt-1 text-gray-500">
          Same <code className="text-gray-400">?tv=</code> as the projector, then sync.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-gray-500">TV receiver #</span>
          <input
            className="input-field w-28 py-1 text-xs"
            value={tvId}
            onChange={(e) => onTvIdChange(e.target.value)}
            placeholder="e.g. 1"
            inputMode="text"
            autoComplete="off"
          />
        </label>
        <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onApplyTvId} disabled={!tvOk}>
          Save TV id
        </button>
        <button
          type="button"
          className="rounded border border-dnd-gold/60 px-2 py-1 text-xs text-dnd-gold hover:bg-dnd-gold/10 disabled:opacity-50"
          onClick={onSyncView}
          disabled={busy}
          title="Push to local tabs + POST to server TV (crops to leader / room when possible)"
        >
          Sync this view to TV
        </button>
        <button
          type="button"
          className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-50"
          onClick={onSyncFull}
          disabled={busy}
          title="Full dungeon + fog — no crop"
        >
          Sync full map (fog)
        </button>
        {busy && <span className="text-[10px] text-gray-500">Syncing…</span>}
      </div>
      {!tvOk && tvId.trim() !== "" && (
        <p className="mt-1 text-[10px] text-amber-200/90">Use letters, numbers, _ or - only (max 32).</p>
      )}
      {status && <p className="mt-2 text-[10px] text-emerald-200/90">{status}</p>}
      {layout === "compact" ? (
        <details className="mt-2 border-t border-gray-800 pt-2">
          <summary className="cursor-pointer text-[10px] text-gray-500">Copy URLs</summary>
          <div className="mt-2 space-y-2">
            <div>
              <div className="text-[10px] text-gray-500">Local tab</div>
              <div className="mt-0.5 flex flex-wrap items-start gap-1">
                <code className="min-w-0 flex-1 break-all text-emerald-200/90">{localUrl}</code>
                <button
                  type="button"
                  className="btn-ghost shrink-0 px-1.5 py-0.5 text-[10px]"
                  onClick={() => void copyText("local player map", localUrl)}
                >
                  <Copy size={12} className="inline" aria-hidden />
                </button>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-500">Projector</div>
              <div className="mt-0.5 flex flex-wrap items-start gap-1">
                <code className="min-w-0 flex-1 break-all text-amber-200/85">{tvUrl}</code>
                <button
                  type="button"
                  className="btn-ghost shrink-0 px-1.5 py-0.5 text-[10px]"
                  onClick={() => void copyText("TV player map", tvUrl)}
                >
                  <Copy size={12} className="inline" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </details>
      ) : (
        <div className="mt-2 border-t border-gray-800 pt-2">
          <div className="text-[10px] text-gray-500">Local tab (same PC)</div>
          <div className="mt-0.5 flex flex-wrap items-start gap-1">
            <code className="min-w-0 flex-1 break-all text-emerald-200/90">{localUrl}</code>
            <button
              type="button"
              className="btn-ghost shrink-0 px-1.5 py-0.5 text-[10px]"
              onClick={() => void copyText("local player map", localUrl)}
              title="Copy"
            >
              <Copy size={12} className="inline" aria-hidden />
            </button>
          </div>
          <div className="mt-2 text-[10px] text-gray-500">Projector / TV</div>
          <div className="mt-0.5 flex flex-wrap items-start gap-1">
            <code className="min-w-0 flex-1 break-all text-amber-200/85">{tvUrl}</code>
            <button
              type="button"
              className="btn-ghost shrink-0 px-1.5 py-0.5 text-[10px]"
              onClick={() => void copyText("TV player map", tvUrl)}
              title="Copy"
            >
              <Copy size={12} className="inline" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Player TV crop: bounding box of all PC tokens + padding so followers in a
 * line/conga are not clipped off the projector (leader-only crops dropped them).
 */
function computePartyViewCropForTv(
  gw: number,
  gh: number,
  tokens: Pick<BattleToken, "gx" | "gy" | "kind">[],
): { minX: number; minY: number; maxX: number; maxY: number } {
  const pad = 6;
  const minSpanW = 26;
  const minSpanH = 20;
  const players = tokens.filter((t) => t.kind === "player");
  if (players.length === 0) {
    return { minX: 0, minY: 0, maxX: Math.max(0, gw - 1), maxY: Math.max(0, gh - 1) };
  }
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (const t of players) {
    const gx = Math.floor(t.gx);
    const gy = Math.floor(t.gy);
    bx0 = Math.min(bx0, gx);
    by0 = Math.min(by0, gy);
    bx1 = Math.max(bx1, gx);
    by1 = Math.max(by1, gy);
  }
  bx0 -= pad;
  by0 -= pad;
  bx1 += pad;
  by1 += pad;
  let w = bx1 - bx0 + 1;
  let h = by1 - by0 + 1;
  if (w < minSpanW) {
    const ex = minSpanW - w;
    bx0 -= Math.floor(ex / 2);
    bx1 += Math.ceil(ex / 2);
    w = minSpanW;
  }
  if (h < minSpanH) {
    const ey = minSpanH - h;
    by0 -= Math.floor(ey / 2);
    by1 += Math.ceil(ey / 2);
    h = minSpanH;
  }
  return {
    minX: Math.max(0, bx0),
    minY: Math.max(0, by0),
    maxX: Math.min(gw - 1, bx1),
    maxY: Math.min(gh - 1, by1),
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
    leaveSession,
  } = useSessionStore();
  const [step, setStep] = useState<FlowStep>("map");
  const [workspacePane, setWorkspacePane] = useState<WorkspacePane>("rolls");
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
      else if (hasDungeon) setStep("party");
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
    { id: "workspace", label: "3. Battle", done: false },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-800 bg-dnd-dark px-4 py-3 sm:px-6">
        <div>
          <h1 className="font-display text-xl font-bold text-dnd-gold sm:text-2xl">DM Play Mode</h1>
          <p className="text-xs text-gray-500">Map and party setup, then run battles from the Battle step.</p>
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
          {activeSession && (
            <button
              type="button"
              onClick={() => {
                leaveSession();
                void loadSessions();
              }}
              className="btn-secondary flex items-center gap-1 text-sm"
            >
              <LogOut size={14} className="shrink-0" />
              <span>Change session</span>
            </button>
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
export function SessionPicker({
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
        <div className="hidden h-full min-h-0 lg:block">
          <DungeonForge />
        </div>
        <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-3 lg:hidden">
          <p className="text-sm text-gray-400">
            The map editor is built for a wide screen. Open <b>Dungeon Forge</b> in the{" "}
            <span className="text-gray-200">Library</span> tab, set <b>ACTIVE SESSION</b> to this one, use{" "}
            <b>SEND TO SESSION</b>, then return here and continue.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/dungeons" className="btn-primary inline-flex items-center gap-1 text-sm">
              Open Dungeon Forge
            </Link>
          </div>
          {hasSaved ? (
            <p className="text-xs text-emerald-400/95">A map is already linked to this session — you can continue.</p>
          ) : (
            <p className="text-xs text-gray-500">Waiting for a saved map on this session…</p>
          )}
        </div>
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
          Continue to Battle →
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
        initiative:
          Math.floor(Math.random() * 20) +
          1 +
          Math.floor(((mon.dexterity ?? 10) - 10) / 2),
        maxHp: mon.hitPoints,
        armorClass: mon.armorClass,
      });
    }
  }
  return monsterRows;
}

function cellBlocksPartyMarch(cell: RenderCell): boolean {
  return (
    cell.eType === "item" ||
    cell.eType === "monster" ||
    cell.eType === "riddle" ||
    cell.eType === "trap"
  );
}

/** Pull NdM from trap damage text like "1d10 piercing" for rolling. */
function trapDamageDiceFromText(dmg: string | null | undefined): string | null {
  return extractDiceNotation(String(dmg ?? ""));
}

/** Turn forge slugs like `werewolf_bf` into readable text for tooltips. */
function humanizeMonsterSlug(slug: string): string {
  return slug
    .replace(/_bf$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapEntityCellHoverLines(cell: RenderCell | null | undefined): string[] | null {
  if (!cell?.eType) return null;
  if (cell.eType === "deco" || cell.eType === "label" || cell.eType === "theme") return null;
  if (!cell.extra || typeof cell.extra !== "object") return null;
  const ex = cell.extra as Record<string, unknown>;
  switch (cell.eType) {
    case "item":
      return [
        `Item: ${String(ex.name ?? ex.slug ?? "?")}`,
        ...(ex.slug ? [`Ref: ${String(ex.slug)}`] : []),
      ];
    case "monster": {
      const name = ex.name != null && String(ex.name).trim() !== "" ? String(ex.name).trim() : null;
      const slug = ex.slug != null ? String(ex.slug).trim() : "";
      const label = name ?? (slug ? humanizeMonsterSlug(slug) : "Creature");
      return [`${label}`];
    }
    case "trap": {
      const lines = [
        `Trap${ex.name ? `: ${String(ex.name)}` : ""}`,
        [ex.detectDC, ex.saveDC].some((x) => x != null)
          ? `Spot DC ${String(ex.detectDC ?? "—")} · ${String(ex.saveType ?? "?")} DC ${String(ex.saveDC ?? "—")}`
          : "",
        ex.dmg ? `Damage: ${String(ex.dmg)}` : "",
        ex.effect ? String(ex.effect) : "",
      ].filter((s) => s && String(s).trim() !== "");
      return lines.length ? lines : [`Trap`];
    }
    case "riddle":
      return [`Riddle`, String(ex.prompt ?? "").slice(0, 200)];
    default:
      return null;
  }
}

// ── Encounter workspace (map + combat + rolls) ───────────────────
export function EncounterWorkspace({
  pane,
  onPaneChange,
}: {
  pane: WorkspacePane;
  onPaneChange: (p: WorkspacePane) => void;
}) {
  const {
    activeSession,
    activeCombat,
    partyCharacters,
    startCombat,
    appendCombatantsToCombat,
    loadPartyChars,
    damageCombatant,
  } = useSessionStore();
  const [dungeon, setDungeon] = useState<any | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState<string | null>(null);
  const [animPhase, setAnimPhase] = useState(0);
  const [sceneLighting, setSceneLighting] = useState(true);
  /** DM laser dot on /dungeons/player (same browser; high-rate sync via BroadcastChannel). */
  const [laserPointerMode, setLaserPointerMode] = useState(false);
  const laserThrottleRef = useRef(0);
  /** `global` = show whole dungeon; `room` = pan/zoom to frame the selected room (grid is never cropped). */
  const [mapCamera, setMapCamera] = useState<"global" | "room">("global");
  const [dmSecRolls, setDmSecRolls] = useState(true);
  const [dmSecCombat, setDmSecCombat] = useState(true);
  const [dmSecRoom, setDmSecRoom] = useState(true);
  const [dmRightSidebarCollapsed, setDmRightSidebarCollapsed] = useState(false);
  const [dmSidebarWidthPx, setDmSidebarWidthPx] = useState(() => {
    if (typeof window === "undefined") return DM_PLAY_SIDEBAR_DEFAULT_PX;
    try {
      const raw = localStorage.getItem(DM_PLAY_SIDEBAR_WIDTH_KEY);
      const n = raw != null ? Number(raw) : NaN;
      return Number.isFinite(n) && n >= DM_PLAY_SIDEBAR_MIN_PX ? n : DM_PLAY_SIDEBAR_DEFAULT_PX;
    } catch {
      return DM_PLAY_SIDEBAR_DEFAULT_PX;
    }
  });
  const [workspaceWideLayout, setWorkspaceWideLayout] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  const workspaceSplitRef = useRef<HTMLDivElement>(null);
  const sidebarResizeActiveRef = useRef(false);
  const sidebarWidthDuringDragRef = useRef(dmSidebarWidthPx);
  const [dmTvId, setDmTvId] = useState(() => {
    try {
      return localStorage.getItem("dnd5e_last_tv")?.trim() || "1";
    } catch {
      return "1";
    }
  });
  const [tvSyncStatus, setTvSyncStatus] = useState<string | null>(null);
  const [tvSyncBusy, setTvSyncBusy] = useState(false);
  const [dmManualReveal, setDmManualReveal] = useState<Set<string>>(() => {
    const p = readLastPlayerMapState();
    return new Set(p?.dmManualRevealCells ?? []);
  });
  const [dmDoorOpen, setDmDoorOpen] = useState<Set<string> | null>(() => {
    const d = readLastPlayerMapState()?.doorOpen;
    if (d === undefined || d === null) return null;
    return new Set(d);
  });
  const [fogPaintMode, setFogPaintMode] = useState(false);
  /** Approximate player/TV rendering: same fog rules, hide DM map markers & secret overlays. */
  const [playerViewPreview, setPlayerViewPreview] = useState(false);
  const shiftEraseRef = useRef(false);
  const prevDungeonTagRef = useRef<string | null>(null);
  const [trapMenuDamageRoll, setTrapMenuDamageRoll] = useState<DamageRollResult | null>(null);
  const [trapDmTargetId, setTrapDmTargetId] = useState<string>("");
  const [trapModalRoll, setTrapModalRoll] = useState<DamageRollResult | null>(null);
  const [trapModalTargetId, setTrapModalTargetId] = useState<string>("");
  const [battleTokens, setBattleTokens] = useState<BattleToken[]>([]);
  const [placementCombatantId, setPlacementCombatantId] = useState<string | null>(null);
  useEffect(() => {
    if (!playerViewPreview) return;
    setFogPaintMode(false);
    setLaserPointerMode(false);
    setPlacementCombatantId(null);
  }, [playerViewPreview]);
  const [mapEntityModal, setMapEntityModal] = useState<
    | null
    | { kind: "item"; x: number; y: number; ent: Record<string, unknown> }
    | { kind: "monster"; x: number; y: number; ent: Record<string, unknown> }
    | { kind: "riddle"; x: number; y: number; ent: Record<string, unknown> }
    | { kind: "trap"; x: number; y: number; ent: Record<string, unknown> }
  >(null);
  const [giveQty, setGiveQty] = useState(1);
  const [giveCharId, setGiveCharId] = useState("");
  const [mapActionBusy, setMapActionBusy] = useState(false);
  /** DM map zoom (multiplier on computed cell size). Pan uses the scrollable viewport. */
  const [dmMapZoom, setDmMapZoom] = useState(1);
  /** Depth / 3D — mirrored to player TV via `viewMode` on sync (flat removed; legacy saves map to depth). */
  const [dmMapViewMode, setDmMapViewMode] = useState<"depth" | "3d">(() => {
    try {
      const v = localStorage.getItem("dnd5e-play-map-view-mode");
      if (v === "flat") return "depth";
      if (v === "depth" || v === "3d") return v;
    } catch {
      /* ignore */
    }
    return "depth";
  });
  const [partyLeaderId, setPartyLeaderId] = useState<string | null>(null);
  const [partyFollowIds, setPartyFollowIds] = useState<string[]>([]);
  const [tokenHoverTip, setTokenHoverTip] = useState<{
    tokens: BattleToken[];
    clientX: number;
    clientY: number;
    cell?: RenderCell | null;
  } | null>(null);
  const [mapCellHover, setMapCellHover] = useState<{
    lines: string[];
    clientX: number;
    clientY: number;
  } | null>(null);
  const [marchMenu, setMarchMenu] = useState<{
    tokenId: string;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [mapEncounterMenu, setMapEncounterMenu] = useState<{
    cell: RenderCell;
    worldGx: number;
    worldGy: number;
    clientX: number;
    clientY: number;
  } | null>(null);
  const [monsterStatCardSlug, setMonsterStatCardSlug] = useState<string | null>(null);
  const [monsterTokenMenu, setMonsterTokenMenu] = useState<{
    combatantId: string;
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
    try {
      localStorage.setItem("dnd5e-play-map-view-mode", dmMapViewMode);
    } catch {
      /* ignore */
    }
  }, [dmMapViewMode]);

  useEffect(() => {
    if (dmMapViewMode === "3d") setPlayerViewPreview(false);
  }, [dmMapViewMode]);

  useEffect(() => {
    if (!activeCombat) setBattleTokens([]);
  }, [activeCombat]);

  useEffect(() => {
    if (!partyLeaderId) return;
    setPartyFollowIds((prev) => prev.filter((id) => id !== partyLeaderId));
  }, [partyLeaderId]);

  useEffect(() => {
    sidebarWidthDuringDragRef.current = dmSidebarWidthPx;
  }, [dmSidebarWidthPx]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const fn = () => setWorkspaceWideLayout(mq.matches);
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  const clampSidebarToContainer = useCallback(() => {
    if (!workspaceWideLayout || dmRightSidebarCollapsed) return;
    const el = workspaceSplitRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const max = Math.min(720, rect.width * 0.58);
    setDmSidebarWidthPx((w) => Math.min(max, Math.max(DM_PLAY_SIDEBAR_MIN_PX, w)));
  }, [workspaceWideLayout, dmRightSidebarCollapsed]);

  useLayoutEffect(() => {
    clampSidebarToContainer();
  }, [clampSidebarToContainer]);

  useEffect(() => {
    window.addEventListener("resize", clampSidebarToContainer);
    return () => window.removeEventListener("resize", clampSidebarToContainer);
  }, [clampSidebarToContainer]);

  const onSidebarResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (dmRightSidebarCollapsed || !workspaceWideLayout) return;
      e.preventDefault();
      sidebarResizeActiveRef.current = true;
      const startX = e.clientX;
      const startW = sidebarWidthDuringDragRef.current;
      const el = workspaceSplitRef.current;

      const onMove = (ev: PointerEvent) => {
        if (!sidebarResizeActiveRef.current || !el) return;
        /** Dragging the handle right widens the map (narrows the sidebar). */
        const delta = ev.clientX - startX;
        const rect = el.getBoundingClientRect();
        const max = Math.min(720, rect.width * 0.58);
        const next = Math.round(Math.min(max, Math.max(DM_PLAY_SIDEBAR_MIN_PX, startW - delta)));
        sidebarWidthDuringDragRef.current = next;
        setDmSidebarWidthPx(next);
      };

      const onUp = () => {
        sidebarResizeActiveRef.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        try {
          localStorage.setItem(DM_PLAY_SIDEBAR_WIDTH_KEY, String(sidebarWidthDuringDragRef.current));
        } catch {
          /* ignore */
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [dmRightSidebarCollapsed, workspaceWideLayout],
  );

  useEffect(() => {
    return () => {
      if (marchIntervalRef.current != null) {
        clearInterval(marchIntervalRef.current);
        marchIntervalRef.current = null;
      }
    };
  }, []);

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

  const dungeonTag = useMemo(
    () =>
      `${activeSession?.id ?? ""}::${String(dungeon?.mapName ?? "")}::${(dungeon?.grid as number[][] | undefined)?.length ?? 0}`,
    [activeSession?.id, dungeon?.mapName, dungeon?.grid],
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftEraseRef.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftEraseRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const prev = prevDungeonTagRef.current;
    if (prev != null && prev !== dungeonTag) {
      setDmManualReveal(new Set());
      setDmDoorOpen(null);
    }
    prevDungeonTagRef.current = dungeonTag;
  }, [dungeonTag]);

  const sendLaserHover = useCallback((gx: number, gy: number) => {
    const now = Date.now();
    if (now - laserThrottleRef.current < 40) return;
    laserThrottleRef.current = now;
    broadcastLaserPointer({ gx, gy });
  }, []);

  useEffect(() => {
    if (!laserPointerMode) broadcastLaserPointer(null);
    else {
      setTokenHoverTip(null);
      setMapCellHover(null);
    }
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
    if (!marchMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMarchMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [marchMenu]);

  useEffect(() => {
    if (!monsterTokenMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMonsterTokenMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [monsterTokenMenu]);

  useEffect(() => {
    if (!mapEncounterMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMapEncounterMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapEncounterMenu]);

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
      if (c.type !== "monster") continue;
      const slug = String(c.monsterSlug ?? "").trim();
      const nameBase = String(c.label ?? "")
        .replace(/\s+\d+$/, "")
        .trim();
      if (!slug && !nameBase) continue;
      const prevHp = prevMonsterHpRef.current[c.id];
      prevMonsterHpRef.current[c.id] = c.currentHp;
      if (prevHp === undefined) continue;
      if (prevHp > 0 && c.currentHp <= 0) {
        const next = decrementForgeMonsterBySlug(working, slug, selectedRoomId, nameBase || null);
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
      return buildRenderGrid(dungeon, {
        showThemes: false,
        playerView: playerViewPreview,
        doorOpen: dmDoorOpen,
        doorStates: readLastPlayerMapState()?.doorStates ?? null,
      });
    } catch {
      return null;
    }
  }, [dungeon, playerViewPreview, dmDoorOpen]);

  /** Stable palette identity — `forgePaletteForDungeon` returns a new object each call; 3D / canvas effects must not thrash on reference churn. */
  const palette = useMemo(() => forgePaletteForDungeon(dungeon), [dungeon]);

  const forgePlay3dOpts = useMemo(() => {
    if (!dungeon) {
      return {
        dungeonLighting: undefined as "lit" | "dim" | "dark" | undefined,
        mapOutdoorTime: undefined as "day" | "dusk" | "night" | undefined,
      };
    }
    const d = dungeon as Record<string, unknown>;
    const loc = dungeon.locationType ?? "dungeon";
    const dl = d.dungeonLighting;
    const dungeonLighting: "lit" | "dim" | "dark" | undefined =
      loc === "dungeon"
        ? dl === "dim" || dl === "dark" || dl === "lit"
          ? (dl as "lit" | "dim" | "dark")
          : "lit"
        : undefined;
    const fo = d.forgeOutdoorTime;
    const mapOutdoorTime: "day" | "dusk" | "night" | undefined =
      loc === "town" || loc === "road"
        ? fo === "day" || fo === "dusk" || fo === "night"
          ? (fo as "day" | "dusk" | "night")
          : "dusk"
        : undefined;
    return {
      dungeonLighting,
      mapOutdoorTime,
    };
  }, [dungeon]);

  /** Padding around the focused room (player TV crop, wall lights). */
  const mapPad = 5;
  const fullCellPx = 12;

  const { displayGrid, worldOffset, cellPx } = useMemo(() => {
    if (!renderGrid || !dungeon) {
      return { displayGrid: null as ReturnType<typeof buildRenderGrid> | null, worldOffset: { x: 0, y: 0 }, cellPx: fullCellPx };
    }
    return { displayGrid: renderGrid, worldOffset: { x: 0, y: 0 }, cellPx: fullCellPx };
  }, [renderGrid, dungeon]);

  const mapViewportRef = useRef<HTMLDivElement>(null);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  /** Cell size so the whole dungeon fits the viewport (before wheel zoom multiplier). */
  const [fullMapFitCellPx, setFullMapFitCellPx] = useState<number | null>(null);

  useEffect(() => {
    if (!displayGrid?.length) {
      setFullMapFitCellPx(null);
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
      const next = Math.floor(Math.min(w / Math.max(1, bw), h / Math.max(1, bh)) * 0.94);
      setFullMapFitCellPx(Math.max(6, Math.min(56, next)));
    };
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, [displayGrid, dungeon?.id]);

  const dmCellPx = fullMapFitCellPx != null ? fullMapFitCellPx : cellPx;

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

  /**
   * Player/TV-equivalent fog — only computed when the DM actually needs to see it (preview or fog paint).
   * Default DM map has **no** fog overlay so the full dungeon stays visible; unrevealed areas were previously
   * drawn as void (black), which looked like “missing rooms” and shifted when doors changed path length / passability.
   */
  const playerViewFogCells = useMemo((): Set<string> | null => {
    if (!playerViewPreview && !fogPaintMode) return null;
    if (!dungeon?.grid || !Array.isArray(dungeon.rooms)) return null;
    const prev = readLastPlayerMapState();
    const { w: gw, h: gh } = effectiveDungeonGridDims(dungeon);
    const dgFog = {
      grid: dungeon.grid,
      rooms: dungeon.rooms,
      width: gw,
      height: gh,
    };
    const revealedSet = new Set<number>([...(prev?.revealed ?? [])]);
    if (room) revealedSet.add(room.id);
    for (const t of tokensForMap) {
      if (t.kind !== "player") continue;
      const rid = cellRoomId(dgFog, Math.floor(t.gx), Math.floor(t.gy));
      if (rid != null) revealedSet.add(rid);
    }
    const doorForFog = dmDoorOpen === null ? null : dmDoorOpen;
    const locForFog = dungeon.locationType ?? "dungeon";
    const manualSeeds = dmManualReveal.size > 0 ? [...dmManualReveal] : null;
    const revealedForFog = applyPlayerHiddenRevealRules(
      revealedSet,
      dungeon.rooms,
      doorForFog,
      readLastPlayerMapState()?.doorStates ?? null,
    );
    const fogCells = computeVisibleCellsForPlayer(
      revealedForFog,
      dgFog,
      doorForFog,
      readLastPlayerMapState()?.doorStates ?? null,
      {
        openFloor: isOpenFloorLocation(locForFog),
        maxFogHops: maxFogHopsForLocationType(locForFog),
        locationType: locForFog,
      },
      manualSeeds,
    );
    expandFogWithPlayerTokenVision(
      fogCells,
      dungeon.grid as number[][],
      tokensForMap,
      DEFAULT_PLAYER_VISION_FOG_CELLS,
      locForFog,
    );
    if (fogCells.size === 0) return null;
    return fogCells;
  }, [playerViewPreview, fogPaintMode, dungeon, room, tokensForMap, dmDoorOpen, dmManualReveal]);

  /** 2D map editing paused (player preview or 3D view). */
  const mapSurfaceLocked = playerViewPreview || dmMapViewMode === "3d";

  const dmMapCamRef = useRef<{ cam: "global" | "room"; room: number | null } | null>(null);

  /**
   * Pan / zoom the map: never crops the grid. `mapCamera === "room"` frames the selected room; `global` fits the whole dungeon.
   * Structural camera changes reset zoom appropriately; panel resize preserves wheel zoom and recenters.
   */
  useLayoutEffect(() => {
    if (dmMapViewMode === "3d") return;
    if (!mapViewportRef.current || !displayGrid?.length) return;
    const el = mapViewportRef.current;
    if (fullMapFitCellPx == null) return;

    const prev = dmMapCamRef.current;
    const structural =
      prev === null || prev.cam !== mapCamera || prev.room !== selectedRoomId;
    dmMapCamRef.current = { cam: mapCamera, room: selectedRoomId };

    const gw = displayGrid[0]!.length;
    const gh = displayGrid.length;

    if (structural) {
      if (mapCamera === "global" || !room) {
        setDmMapZoom(1);
        const zc = dmCellPx;
        const cx = (gw * zc) / 2;
        const cy = (gh * zc) / 2;
        setViewPan({
          x: el.clientWidth / 2 - cx,
          y: el.clientHeight / 2 - cy,
        });
        return;
      }
      const padC = 2;
      const rw = room.w + 2 * padC;
      const rh = room.h + 2 * padC;
      const rwPx = rw * dmCellPx;
      const rhPx = rh * dmCellPx;
      const zx = (0.82 * el.clientWidth) / Math.max(1, rwPx);
      const zy = (0.82 * el.clientHeight) / Math.max(1, rhPx);
      const targetZ = Math.max(0.35, Math.min(2.5, Math.min(zx, zy)));
      setDmMapZoom(targetZ);
      const zc = dmCellPx * targetZ;
      const cx = (room.x + room.w / 2) * zc;
      const cy = (room.y + room.h / 2) * zc;
      setViewPan({
        x: el.clientWidth / 2 - cx,
        y: el.clientHeight / 2 - cy,
      });
      return;
    }

    const zc = zoomedDmCellPx;
    if (zc <= 0) return;
    if (mapCamera === "global" || !room) {
      const cx = (gw * zc) / 2;
      const cy = (gh * zc) / 2;
      setViewPan({
        x: el.clientWidth / 2 - cx,
        y: el.clientHeight / 2 - cy,
      });
      return;
    }
    const pad = 2;
    const rx = room.x - worldOffset.x;
    const ry = room.y - worldOffset.y;
    const minPxX = Math.max(0, (rx - pad) * zc);
    const minPxY = Math.max(0, (ry - pad) * zc);
    const maxPxX = (rx + room.w + pad) * zc;
    const maxPxY = (ry + room.h + pad) * zc;
    const cx = (minPxX + maxPxX) / 2;
    const cy = (minPxY + maxPxY) / 2;
    setViewPan({
      x: el.clientWidth / 2 - cx,
      y: el.clientHeight / 2 - cy,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- do not re-run when only wheel zoom changes
  }, [
    dmMapViewMode,
    mapCamera,
    fullMapFitCellPx,
    room?.id,
    selectedRoomId,
    worldOffset.x,
    worldOffset.y,
    dmCellPx,
    displayGrid,
  ]);

  /** Wheel zoom (Dungeon Forge–style) anchored to cursor; updates pan so the map doesn’t jump. */
  useEffect(() => {
    const el = mapViewportRef.current;
    if (!el || laserPointerMode || dmMapViewMode === "3d") return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? 0.92 : 1.08;
      setDmMapZoom((zPrev) => {
        const zNew = Math.max(0.35, Math.min(2.5, zPrev * delta));
        const ratio = zNew / zPrev;
        setViewPan((p) => ({
          x: mx - ratio * (mx - p.x),
          y: my - ratio * (my - p.y),
        }));
        return zNew;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [laserPointerMode, dmMapViewMode]);

  useEffect(() => {
    if (!mapEncounterMenu) {
      setTrapMenuDamageRoll(null);
      return;
    }
    if (mapEncounterMenu.cell.eType === "trap") {
      setTrapMenuDamageRoll(null);
      const firstPc = playerCombatants.find((c) => c.type === "player" && c.isAlive);
      setTrapDmTargetId((prev) => {
        if (prev && playerCombatants.some((c) => c.id === prev && c.isAlive)) return prev;
        return firstPc?.id ?? "";
      });
    }
  }, [mapEncounterMenu, playerCombatants]);

  useEffect(() => {
    if (mapEntityModal?.kind !== "trap") {
      setTrapModalRoll(null);
      return;
    }
    setTrapModalRoll(null);
    const firstPc = playerCombatants.find((c) => c.type === "player" && c.isAlive);
    setTrapModalTargetId((prev) => {
      if (prev && playerCombatants.some((c) => c.id === prev && c.isAlive)) return prev;
      return firstPc?.id ?? "";
    });
  }, [mapEntityModal, playerCombatants]);

  const pushPlayerMapEverywhere = useCallback(
    async (opts: { cropToRoom: boolean; quiet?: boolean }) => {
      if (!dungeon?.grid || !Array.isArray(dungeon.rooms)) {
        if (!opts.quiet) setTvSyncStatus("No dungeon snapshot to sync — use the Map step / Map Library first.");
        return;
      }
      const prev = readLastPlayerMapState();
      const { w: gw, h: gh } = effectiveDungeonGridDims(dungeon);
      const dgFog = {
        grid: dungeon.grid,
        rooms: dungeon.rooms,
        width: gw,
        height: gh,
      };

      const revealedSet = new Set<number>([...(prev?.revealed ?? [])]);
      if (room) revealedSet.add(room.id);
      for (const t of tokensForMap) {
        if (t.kind !== "player") continue;
        const rid = cellRoomId(dgFog, Math.floor(t.gx), Math.floor(t.gy));
        if (rid != null) revealedSet.add(rid);
      }
      const revealed = Array.from(revealedSet);

      const doorForFog = dmDoorOpen === null ? null : dmDoorOpen;
      const locForFog = dungeon.locationType ?? "dungeon";
      const gd: PlayerDungeonData = {
        grid: dungeon.grid,
        rooms: dungeon.rooms,
        width: gw,
        height: gh,
        mapName: dungeon.mapName,
        entities: dungeon.entities ?? [],
        decoOverlay: dungeon.decoOverlay ?? [],
        locationType: dungeon.locationType,
        floor: dungeon.floor,
        glyphs: dungeon.glyphs,
        forgeLocationMeta: dungeon.forgeLocationMeta as PlayerDungeonData["forgeLocationMeta"],
        forgeRenderOverlay: dungeon.forgeRenderOverlay as PlayerDungeonData["forgeRenderOverlay"],
      };

      let viewCrop: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
      if (opts.cropToRoom) {
        const hasPlayers = tokensForMap.some((t) => t.kind === "player");
        if (hasPlayers) {
          viewCrop = computePartyViewCropForTv(gw, gh, tokensForMap);
        } else if (room) {
          viewCrop = {
            minX: Math.max(0, room.x - mapPad),
            minY: Math.max(0, room.y - mapPad),
            maxX: Math.min(gw - 1, room.x + room.w + mapPad - 1),
            maxY: Math.min(gh - 1, room.y + room.h + mapPad - 1),
          };
        }
      }

      const manualSeeds = dmManualReveal.size > 0 ? [...dmManualReveal] : null;
      const doorStates = readLastPlayerMapState()?.doorStates ?? null;
      const revealedForFog = applyPlayerHiddenRevealRules(
        new Set(revealed),
        dungeon.rooms,
        doorForFog,
        doorStates,
      );
      const fogCells = computeVisibleCellsForPlayer(
        revealedForFog,
        dgFog,
        doorForFog,
        doorStates,
        {
          openFloor: isOpenFloorLocation(locForFog),
          maxFogHops: maxFogHopsForLocationType(locForFog),
          locationType: locForFog,
        },
        manualSeeds,
      );
      expandFogWithPlayerTokenVision(
        fogCells,
        dungeon.grid as number[][],
        tokensForMap,
        DEFAULT_PLAYER_VISION_FOG_CELLS,
        locForFog,
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
        fogColor: prev?.fogColor ?? "#1f1a15",
        selectedRoomId: room?.id ?? prev?.selectedRoomId,
        viewCrop,
        battleTokens: tokensForMap,
        dmManualRevealCells: [...dmManualReveal],
        doorOpen: dmDoorOpen === null ? null : [...dmDoorOpen],
        pushedAt: new Date().toISOString(),
        viewMode: dmMapViewMode,
      };
      if (lightsWorld.length > 0) {
        payload.sceneLights = lightsWorld;
      }

      broadcastPlayerMapState(payload);

      const tv = dmTvId.trim();
      if (!tv || !TV_ID_PATTERN.test(tv)) {
        if (!opts.quiet) {
          setTvSyncStatus(
            "Local preview updated. Enter a valid TV # and Save, then sync again to reach the projector.",
          );
        }
        return;
      }
      try {
        localStorage.setItem("dnd5e_last_tv", tv);
      } catch {
        /* ignore */
      }
      try {
        const res = await fetch(`/api/tv/${encodeURIComponent(tv)}/player-map`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || `HTTP ${res.status}`);
        }
        if (!opts.quiet) {
          setTvSyncStatus(`Synced to TV “${tv}”. The projector page should update within a second.`);
        }
      } catch (e) {
        if (!opts.quiet) {
          setTvSyncStatus(e instanceof Error ? e.message : String(e));
        }
      }
    },
    [
      dungeon,
      room,
      mapPad,
      tokensForMap,
      sceneLighting,
      partyLeaderId,
      dmManualReveal,
      dmDoorOpen,
      dmTvId,
      dmMapViewMode,
    ],
  );

  const runTvSync = useCallback(
    async (cropToRoom: boolean) => {
      window.dispatchEvent(new CustomEvent("dm-play:tv-sync-busy"));
      setTvSyncBusy(true);
      setTvSyncStatus(null);
      try {
        await pushPlayerMapEverywhere({ cropToRoom, quiet: false });
      } finally {
        setTvSyncBusy(false);
        window.dispatchEvent(new CustomEvent("dm-play:tv-sync-idle"));
      }
    },
    [pushPlayerMapEverywhere],
  );

  useEffect(() => {
    const onSetTv = (e: Event) => {
      const d = (e as CustomEvent<{ tvId?: string }>).detail?.tvId;
      if (typeof d === "string") setDmTvId(d);
    };
    const onSyncView = () => void runTvSync(true);
    const onSyncFull = () => void runTvSync(false);
    window.addEventListener(DM_PLAY_SET_TV_ID, onSetTv as EventListener);
    window.addEventListener(DM_PLAY_SYNC_VIEW, onSyncView);
    window.addEventListener(DM_PLAY_SYNC_FULL, onSyncFull);
    return () => {
      window.removeEventListener(DM_PLAY_SET_TV_ID, onSetTv as EventListener);
      window.removeEventListener(DM_PLAY_SYNC_VIEW, onSyncView);
      window.removeEventListener(DM_PLAY_SYNC_FULL, onSyncFull);
    };
  }, [runTvSync]);

  const broadcastRef = useRef(pushPlayerMapEverywhere);
  broadcastRef.current = pushPlayerMapEverywhere;

  /** Any PC token move should refresh the TV (not only the leader — followers were stale). */
  const partyPosKey = useMemo(
    () =>
      tokensForMap
        .filter((t) => t.kind === "player" && t.id)
        .map((t) => `${String(t.id)}:${Math.floor(t.gx)},${Math.floor(t.gy)}`)
        .sort()
        .join("|"),
    [tokensForMap],
  );

  useEffect(() => {
    if (!partyPosKey) return;
    const id = window.setTimeout(() => {
      void broadcastRef.current?.({ cropToRoom: true, quiet: true });
    }, 110);
    return () => clearTimeout(id);
  }, [partyPosKey]);

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
      const locType = dungeon?.locationType ?? "dungeon";
      const tile = grid[targetGy]?.[targetGx];
      if (!isDungeonGridWalkable(tile, locType)) return;

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
          const useConga =
            !!partyLeaderId &&
            partyFollowIds.length > 0 &&
            marchIds.has(partyLeaderId) &&
            partyFollowIds.some((id) => marchIds.has(id));

          if (useConga) {
            const occ = new Set(prev.map((t) => `${Math.floor(t.gx)},${Math.floor(t.gy)}`));
            const leader = prev.find((t) => t.id === partyLeaderId);
            if (!leader?.id) {
              return prev;
            }
            const oldLx = Math.floor(leader.gx);
            const oldLy = Math.floor(leader.gy);
            const oldLKey = `${oldLx},${oldLy}`;

            const next = prev.map((t) => ({ ...t }));
            const write = (id: string, gx: number, gy: number) => {
              const i = next.findIndex((x) => x.id === id);
              if (i >= 0) next[i] = { ...next[i]!, gx, gy };
            };

            let changed = false;
            const lStep = greedyStepToward(
              { gx: leader.gx, gy: leader.gy },
              { gx: targetGx, gy: targetGy },
              grid,
              occ,
              oldLKey,
              locType,
            );
            if (lStep && (lStep.gx !== oldLx || lStep.gy !== oldLy)) {
              occ.delete(oldLKey);
              occ.add(`${lStep.gx},${lStep.gy}`);
              write(partyLeaderId, lStep.gx, lStep.gy);
              changed = true;
            }

            for (const fid of partyFollowIds) {
              if (!marchIds.has(fid)) continue;
              const ft = next.find((t) => t.id === fid);
              if (!ft?.id) continue;
              const fx = Math.floor(ft.gx);
              const fy = Math.floor(ft.gy);
              const fk = `${fx},${fy}`;
              const step = greedyStepToward(
                { gx: ft.gx, gy: ft.gy },
                { gx: oldLx, gy: oldLy },
                grid,
                occ,
                fk,
                locType,
              );
              if (step && (step.gx !== fx || step.gy !== fy)) {
                occ.delete(fk);
                occ.add(`${step.gx},${step.gy}`);
                write(fid, step.gx, step.gy);
                changed = true;
              }
            }

            const nl = next.find((t) => t.id === partyLeaderId);
            const leaderDone =
              nl != null && Math.floor(nl.gx) === targetGx && Math.floor(nl.gy) === targetGy;

            if (leaderDone || !changed || marchStepRef.n > 900) {
              if (marchIntervalRef.current != null) {
                clearInterval(marchIntervalRef.current);
                marchIntervalRef.current = null;
              }
              queueMicrotask(() => void broadcastRef.current?.({ cropToRoom: true, quiet: true }));
              return next;
            }
            if (marchStepRef.n % 2 === 0) {
              queueMicrotask(() => void broadcastRef.current?.({ cropToRoom: true, quiet: true }));
            }
            return next;
          }

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
              locType,
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
            queueMicrotask(() => void broadcastRef.current?.({ cropToRoom: true, quiet: true }));
            return next;
          }
          if (marchStepRef.n % 2 === 0) {
            queueMicrotask(() => void broadcastRef.current?.({ cropToRoom: true, quiet: true }));
          }
          return next;
        });
      }, 85);
    },
    [dungeon?.grid, dungeon?.locationType, activeCombat, tokensForMap, partyLeaderId, partyFollowIds, stopPartyMarch],
  );

  const handleTokenDragTo = useCallback(
    (tokenId: string | undefined, wx: number, wy: number) => {
      if (tokenId !== partyLeaderId) followerSnapRef.current = null;
      const grid = dungeon?.grid as number[][] | undefined;
      const loc = dungeon?.locationType ?? "dungeon";
      const fx = Math.floor(wx);
      const fy = Math.floor(wy);
      setBattleTokens((prev) => {
        const tok = prev.find((t) => t.id === tokenId);
        if (grid?.length && (tok?.kind === "player" || tok?.kind === "monster")) {
          if (!isDungeonGridWalkable(grid[fy]?.[fx], loc)) return prev;
        }
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
    [partyLeaderId, partyFollowIds, dungeon?.grid, dungeon?.locationType],
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
      const dx = Math.round(p.worldGx - p.startWorldGx);
      const dy = Math.round(p.worldGy - p.startWorldGy);
      const grid = dungeon?.grid as number[][] | undefined;
      const loc = dungeon?.locationType ?? "dungeon";
      setBattleTokens((prev) => {
        if (!partyLeaderId || p.tokenId !== partyLeaderId || !followerSnapRef.current) {
          followerSnapRef.current = null;
          const fx = Math.floor(p.worldGx);
          const fy = Math.floor(p.worldGy);
          const tok = prev.find((t) => t.id === p.tokenId);
          if (grid?.length && tok?.kind === "player") {
            if (!isDungeonGridWalkable(grid[fy]?.[fx], loc)) return prev;
            const pathDrop = shortestWalkablePathBfs(
              grid,
              { gx: Math.floor(p.startWorldGx), gy: Math.floor(p.startWorldGy) },
              { gx: fx, gy: fy },
              loc,
            );
            if (!pathDrop) return prev;
          }
          if (grid?.length && tok?.kind === "monster") {
            if (!isDungeonGridWalkable(grid[fy]?.[fx], loc)) return prev;
          }
          return prev.map((t) => (t.id === p.tokenId ? { ...t, gx: fx, gy: fy } : t));
        }
        const snap = followerSnapRef.current;
        followerSnapRef.current = null;
        if (!grid?.length) {
          return prev.map((t) => {
            if (t.id === p.tokenId) return { ...t, gx: p.worldGx, gy: p.worldGy };
            if (t.id && snap[t.id]) {
              const o = snap[t.id]!;
              return { ...t, gx: o.gx + dx, gy: o.gy + dy };
            }
            return t;
          });
        }

        const lx = Math.floor(p.worldGx);
        const ly = Math.floor(p.worldGy);
        const lStart = { gx: Math.floor(p.startWorldGx), gy: Math.floor(p.startWorldGy) };
        const lEnd = { gx: lx, gy: ly };
        const path = shortestWalkablePathBfs(grid, lStart, lEnd, loc);
        if (!path) {
          return prev;
        }

        const movingIds = new Set<string>([partyLeaderId, ...Object.keys(snap)]);
        const occ = new Set<string>();
        for (const t of prev) {
          if (!t.id || !movingIds.has(t.id)) {
            occ.add(`${Math.floor(t.gx)},${Math.floor(t.gy)}`);
          }
        }
        occ.add(`${lx},${ly}`);

        const nextFollowerPos = new Map<string, { gx: number; gy: number }>();
        const followerIds = Object.keys(snap);
        const maxSteps = Math.min(200, Math.abs(dx) + Math.abs(dy) + 64);

        if (path && path.length >= 2) {
          const n = path.length;
          const taken = new Set<string>();
          const slotFor = new Map<string, { gx: number; gy: number }>();
          for (let fi = 0; fi < followerIds.length; fi++) {
            const fid = followerIds[fi]!;
            let si = Math.max(0, n - 2 - fi);
            while (si >= 0 && taken.has(`${path[si]!.gx},${path[si]!.gy}`)) si--;
            if (si < 0) {
              for (let j = n - 2; j >= 0; j--) {
                if (!taken.has(`${path[j]!.gx},${path[j]!.gy}`)) {
                  si = j;
                  break;
                }
              }
            }
            if (si < 0) si = Math.max(0, n - 2);
            const cell = path[si]!;
            taken.add(`${cell.gx},${cell.gy}`);
            slotFor.set(fid, cell);
          }
          for (const fid of followerIds) {
            const o = snap[fid]!;
            const start = { gx: Math.floor(o.gx), gy: Math.floor(o.gy) };
            const target = slotFor.get(fid)!;
            const end = walkGreedyStepsOnGrid(
              grid,
              start,
              target,
              occ,
              maxSteps,
              dungeon?.locationType ?? "dungeon",
            );
            nextFollowerPos.set(fid, end);
            occ.add(`${end.gx},${end.gy}`);
          }
        } else {
          for (const fid of followerIds) {
            const o = snap[fid]!;
            const start = { gx: Math.floor(o.gx), gy: Math.floor(o.gy) };
            const target = { gx: Math.floor(o.gx + dx), gy: Math.floor(o.gy + dy) };
            const end = walkGreedyStepsOnGrid(
              grid,
              start,
              target,
              occ,
              maxSteps,
              dungeon?.locationType ?? "dungeon",
            );
            nextFollowerPos.set(fid, end);
            occ.add(`${end.gx},${end.gy}`);
          }
        }

        return prev.map((t) => {
          if (t.id === p.tokenId) return { ...t, gx: lx, gy: ly };
          if (t.id && nextFollowerPos.has(t.id)) {
            const pos = nextFollowerPos.get(t.id)!;
            return { ...t, gx: pos.gx, gy: pos.gy };
          }
          return t;
        });
      });
    },
    [partyLeaderId, dungeon?.grid, dungeon?.locationType],
  );

  useEffect(() => {
    if (!selectedRoomId || !dungeon?.grid) return;
    void broadcastRef.current?.({ cropToRoom: true, quiet: true });
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

  const findRoomAtWorld = useCallback(
    (gx: number, gy: number) =>
      (dungeon?.rooms as { x: number; y: number; w: number; h: number; id: number }[] | undefined)?.find(
        (rm) => gx >= rm.x && gx < rm.x + rm.w && gy >= rm.y && gy < rm.y + rm.h,
      ) ?? null,
    [dungeon?.rooms],
  );

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

  const appendMonstersForEntities = async (
    ents: { slug?: string; name?: string; count?: number }[],
  ) => {
    if (!activeSession?.id || !activeCombat || ents.length === 0) return;
    setLaunching(true);
    setLaunchMsg(null);
    try {
      const monsterRows = await buildForgeMonsterCombatants(ents);
      if (monsterRows.length === 0) {
        throw new Error("Could not resolve monsters against the compendium.");
      }
      await appendCombatantsToCombat(monsterRows);
      onPaneChange("combat");
      setLaunchMsg(`Added ${monsterRows.length} monster(s) to initiative.`);
      setTimeout(() => setLaunchMsg(null), 5000);
      setMapEncounterMenu(null);
    } catch (err) {
      setLaunchMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setLaunching(false);
    }
  };

  const addCellMonsterToInitiative = async () => {
    if (!mapEncounterMenu || !activeCombat) return;
    const ex = mapEncounterMenu.cell.extra;
    if (!ex || typeof ex !== "object" || (ex as { type?: string }).type !== "monster") return;
    const ent = ex as { slug?: string; name?: string; count?: number };
    await appendMonstersForEntities([ent]);
  };

  const addAllRoomMonstersAtMenuPosition = async () => {
    if (!mapEncounterMenu || !activeCombat || !dungeon) return;
    const rm = findRoomAtWorld(mapEncounterMenu.worldGx, mapEncounterMenu.worldGy);
    if (!rm) {
      setLaunchMsg("Could not find a room for this tile.");
      return;
    }
    const ents = (dungeon.entities ?? []).filter(
      (e: { roomId?: number; type?: string }) => e.roomId === rm.id && e.type === "monster",
    ) as { slug?: string; name?: string; count?: number }[];
    if (ents.length === 0) {
      setLaunchMsg("No scripted monsters in that room.");
      return;
    }
    await appendMonstersForEntities(ents);
  };

  const startCombatFromMapMonsterCell = async () => {
    if (!mapEncounterMenu || activeCombat || !dungeon || !activeSession?.id) return;
    if (partyCharacters.length === 0) {
      setLaunchMsg("Add party members first (Party step).");
      return;
    }
    const ex = mapEncounterMenu.cell.extra;
    if (!ex || typeof ex !== "object" || (ex as { type?: string }).type !== "monster") return;
    setLaunching(true);
    setLaunchMsg(null);
    try {
      const monsterRows = await buildForgeMonsterCombatants([
        ex as { slug?: string; name?: string; count?: number },
      ]);
      if (monsterRows.length === 0) throw new Error("Could not resolve this creature.");
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
        `Map — ${dungeon.mapName ?? "Encounter"}`,
        [...players, ...monsterRows],
      );
      onPaneChange("combat");
      setMapEncounterMenu(null);
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
    <div
      ref={workspaceSplitRef}
      className={clsx(
        "flex h-full min-h-0 flex-col gap-3 lg:flex-row lg:items-stretch",
        dmRightSidebarCollapsed ? "lg:gap-2" : "lg:gap-0",
      )}
    >
      <div className="dnd-card hidden min-h-0 min-w-0 flex-1 flex-col overflow-hidden lg:flex">
        <div className="mb-2 hidden rounded border border-gray-800/90 bg-black/35 px-2 py-1.5 text-[10px] leading-snug text-gray-400 md:block">
          <span className="font-display font-semibold text-dnd-gold/85">TV / projector</span> — controls live in the{" "}
          <span className="text-gray-300">left sidebar</span> (below the nav).{" "}
          {tvSyncStatus ? (
            <span className="text-emerald-200/90">{tvSyncStatus}</span>
          ) : (
            <span className="text-gray-600">Sync status appears here.</span>
          )}
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          <span>
            {dungeon?.mapName ?? "Dungeon"} · click a room chip or the map to select a room (needed for token placement,
            room lights, and notes). Drag to pan, wheel to zoom.
            {placementCombatantId ? " (placing token)" : ""}
          </span>
          {dungeon && renderGrid && (
            <>
              <button
                type="button"
                role="switch"
                aria-pressed={fogPaintMode}
                title="Paint extra fog-reveal seeds (Shift+click removes). Matches player fog rules; sync to TV when ready."
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
                  fogPaintMode
                    ? "border-dnd-gold/70 bg-dnd-gold/15 text-dnd-gold"
                    : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-200",
                )}
                disabled={mapSurfaceLocked}
                onClick={() => {
                  setFogPaintMode((v) => {
                    const next = !v;
                    if (next) {
                      setLaserPointerMode(false);
                      setPlayerViewPreview(false);
                    }
                    return next;
                  });
                }}
              >
                <Paintbrush size={15} className="shrink-0 opacity-90" aria-hidden />
                Fog paint
              </button>
              <button
                type="button"
                role="switch"
                aria-pressed={sceneLighting}
                title="Torch / wall lights in the focused room (on by default)"
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
                  sceneLighting
                    ? "border-amber-600/60 bg-amber-950/40 text-amber-200/95"
                    : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-200",
                )}
                onClick={() => setSceneLighting((v) => !v)}
              >
                <Flame size={15} className="shrink-0 opacity-90" aria-hidden />
                Lights
              </button>
              <button
                type="button"
                role="switch"
                aria-pressed={laserPointerMode}
                title="Red dot on the player / TV map"
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
                  laserPointerMode
                    ? "border-red-500/60 bg-red-950/35 text-red-200"
                    : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-200",
                )}
                disabled={playerViewPreview}
                onClick={() => {
                  setLaserPointerMode((v) => {
                    const next = !v;
                    if (next) {
                      setFogPaintMode(false);
                      setPlayerViewPreview(false);
                    }
                    return next;
                  });
                }}
              >
                <Crosshair size={15} className="shrink-0 opacity-90" aria-hidden />
                Laser
              </button>
              <button
                type="button"
                role="switch"
                aria-pressed={playerViewPreview}
                disabled={dmMapViewMode === "3d"}
                title={
                  dmMapViewMode === "3d"
                    ? "Switch to Depth for 2D player preview."
                    : "Show roughly what players see on the TV: same fog of war, no DM map icons or secret-door highlights. Pan and zoom still work; map editing is paused."
                }
                className={clsx(
                  "inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium transition-colors",
                  playerViewPreview
                    ? "border-cyan-500/60 bg-cyan-950/45 text-cyan-100"
                    : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-200",
                  dmMapViewMode === "3d" && "cursor-not-allowed opacity-40",
                )}
                onClick={() => setPlayerViewPreview((v) => !v)}
              >
                <Eye size={15} className="shrink-0 opacity-90" aria-hidden />
                Player view
              </button>
              <span className="text-[10px] uppercase tracking-wide text-gray-600">Display</span>
              {(
                [
                  { k: "depth" as const, label: "Depth", t: "2D with wall depth and lighting (default). Sync sends this mode to the TV." },
                  { k: "3d" as const, label: "3D", t: "Three.js view. Sync sends 3D to player TVs." },
                ] as const
              ).map(({ k, label, t }) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={dmMapViewMode === k}
                  title={t}
                  className={clsx(
                    "rounded border px-2 py-0.5 text-[11px] font-medium",
                    dmMapViewMode === k
                      ? "border-dnd-gold/70 bg-dnd-gold/12 text-dnd-gold"
                      : "border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-200",
                  )}
                  onClick={() => setDmMapViewMode(k)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setMapCamera("global")}
                className="rounded border border-gray-600 px-2 py-0.5 text-gray-300 hover:bg-gray-800"
                title="Reset view to show the entire dungeon at the default zoom"
              >
                Fit entire dungeon
              </button>
              {room && (
                <button
                  type="button"
                  onClick={() => setMapCamera("room")}
                  className="rounded border border-dnd-gold/50 px-2 py-0.5 text-dnd-gold hover:bg-dnd-gold/10"
                  title="Pan and zoom to frame the selected room (map is not cropped)"
                >
                  Focus selected room
                </button>
              )}
              <button
                type="button"
                className="rounded border border-gray-700 px-2 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800"
                onClick={() => {
                  setDmManualReveal(new Set());
                  setTvSyncStatus("Cleared fog paintbrush seeds (sync to apply).");
                }}
                title="Clear DM-painted fog seeds only"
              >
                Clear fog paint
              </button>
              <span className="tabular-nums text-gray-500" title="Mouse wheel zooms toward the cursor; drag empty map to pan.">
                {Math.round(dmMapZoom * 100)}%
              </span>
            </>
          )}
        </div>
        {activeCombat && room && (
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
            <span className="text-gray-500">Tokens:</span>
            <button
              type="button"
              className="btn-ghost min-h-0 px-2 py-0.5 text-xs"
              disabled={mapSurfaceLocked}
              onClick={() => void scatterTokensInRoom()}
            >
              Scatter in room
            </button>
            <select
              className="input-field max-w-[10rem] py-0.5 text-xs"
              value={placementCombatantId ?? ""}
              disabled={mapSurfaceLocked}
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
            <span title="Right-click a PC token to set march leader and who follows. Click empty walkable floor to march the party.">
              March: right-click a PC token for leader &amp; followers · click walkable floor to move
            </span>
            <span className="text-gray-600">|</span>
            <span>
              Leader:{" "}
              <span className="text-gray-200">
                {partyLeaderId
                  ? playerCombatants.find((c) => c.id === partyLeaderId)?.label ?? "—"
                  : "—"}
              </span>
            </span>
            {partyFollowIds.length > 0 && (
              <span title="These characters path behind the leader when you march.">
                Follow:{" "}
                {partyFollowIds
                  .map((id) => playerCombatants.find((c) => c.id === id)?.label ?? id)
                  .join(", ")}
              </span>
            )}
            <span
              className="text-gray-500"
              title="Player TV crops around the leader. Fog uses each PC’s sight. Drag empty map to pan when zoomed."
            >
              TV follows leader
            </span>
          </div>
        )}
        <div
          ref={mapViewportRef}
          className="relative flex min-h-0 flex-1 overflow-hidden rounded border border-gray-800/50 bg-black/90 p-0"
        >
          {playerViewPreview && (
            <div className="pointer-events-none absolute left-2 top-2 z-20 rounded border border-cyan-500/40 bg-black/75 px-2 py-1 text-[11px] font-medium text-cyan-100 shadow-lg">
              Player view
            </div>
          )}
          {dungeon && renderGrid && displayGrid ? (
            dmMapViewMode === "3d" ? (
              <div className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
                <Suspense
                  fallback={
                    <div className="flex flex-1 items-center justify-center text-xs text-gray-500">
                      Loading 3D…
                    </div>
                  }
                >
                  <DungeonForge3D
                    grid={displayGrid}
                    palette={palette}
                    entities={ENTITY_PALETTE}
                    fogCells={playerViewPreview || fogPaintMode ? playerViewFogCells : null}
                    doorOpen={dmDoorOpen}
                    animPhase={animPhase}
                    sceneLights={sceneLightsLocal}
                    dungeonLighting={forgePlay3dOpts.dungeonLighting}
                    mapOutdoorTime={forgePlay3dOpts.mapOutdoorTime}
                    playerSanitize={playerViewPreview}
                    showEnts={!playerViewPreview}
                  />
                </Suspense>
              </div>
            ) : (
            <div
              className="relative inline-block"
              style={{
                transform: `translate(${viewPan.x}px, ${viewPan.y}px)`,
                transformOrigin: "0 0",
              }}
            >
            <DungeonMapCanvas
              grid={displayGrid}
              cellPx={zoomedDmCellPx}
              palette={palette}
              entities={ENTITY_PALETTE}
              showEnts={!playerViewPreview}
              playerSanitize={playerViewPreview}
              fogCells={playerViewPreview || fogPaintMode ? playerViewFogCells : null}
              fogUnexploredColor={
                playerViewPreview || fogPaintMode
                  ? readLastPlayerMapState()?.fogColor ?? "#1f1a15"
                  : undefined
              }
              fogAmbientAnim={!!(playerViewPreview || fogPaintMode)}
              fogFrontierHighlight={!!(playerViewPreview || fogPaintMode)}
              doorOpen={dmDoorOpen}
              highlightRoom={
                playerViewPreview
                  ? null
                  : room && mapCamera === "room"
                    ? { x: room.x, y: room.y, w: room.w, h: room.h }
                    : null
              }
              worldOffset={worldOffset}
              animPhase={animPhase}
              sceneLights={sceneLightsLocal}
              depthPass={dmMapViewMode === "depth"}
              vignettePass={dmMapViewMode === "depth"}
              depthFog={dmMapViewMode === "depth"}
              battleTokens={tokensLocal.length ? tokensLocal : undefined}
              playerSightRingCells={playerViewPreview ? null : PLAYER_SIGHT_RING_CELLS}
              tokenDragEnabled={
                !!activeCombat && !laserPointerMode && !fogPaintMode && !playerViewPreview
              }
              suppressTokenInteraction={laserPointerMode || fogPaintMode || playerViewPreview}
              mapViewportPan={viewPan}
              onMapViewportPanChange={setViewPan}
              onTokenDragTo={handleTokenDragTo}
              onTokenDragEnd={handleTokenDragEnd}
              onTokensAtCell={
                laserPointerMode || fogPaintMode || playerViewPreview
                  ? undefined
                  : (p) => {
                      if (!p || p.tokensHere.length === 0) {
                        setTokenHoverTip(null);
                        return;
                      }
                      setTokenHoverTip({
                        tokens: p.tokensHere,
                        clientX: p.clientX,
                        clientY: p.clientY,
                        cell: p.cell,
                      });
                      setMapCellHover(null);
                    }
              }
              mapPanEnabled={!laserPointerMode && !fogPaintMode}
              style={
                fogPaintMode
                  ? { cursor: "cell" }
                  : laserPointerMode
                    ? { cursor: "crosshair" }
                    : undefined
              }
              onPlayerTokenContextMenu={
                laserPointerMode || fogPaintMode || playerViewPreview || !activeCombat
                  ? undefined
                  : (payload) => {
                      setMarchMenu({
                        tokenId: payload.tokenId,
                        clientX: payload.clientX,
                        clientY: payload.clientY,
                      });
                    }
              }
              onMonsterTokenContextMenu={
                laserPointerMode || fogPaintMode || playerViewPreview || !activeCombat
                  ? undefined
                  : (payload) => {
                      setMonsterTokenMenu({
                        combatantId: payload.tokenId,
                        clientX: payload.clientX,
                        clientY: payload.clientY,
                      });
                    }
              }
              onCellHover={
                laserPointerMode
                  ? (hx, hy) => {
                      if (hx < 0 || hy < 0) broadcastLaserPointer(null);
                      else sendLaserHover(hx, hy);
                    }
                  : playerViewPreview
                    ? () => {
                        setMapCellHover(null);
                      }
                    : (hx, hy, cell, ptr) => {
                        if (hx < 0 || hy < 0 || !ptr) {
                          setMapCellHover(null);
                          return;
                        }
                        const lines = mapEntityCellHoverLines(cell);
                        if (lines?.length) {
                          setMapCellHover({
                            lines,
                            clientX: ptr.clientX,
                            clientY: ptr.clientY,
                          });
                        } else {
                          setMapCellHover(null);
                        }
                      }
              }
              onCellClick={(gx, gy, cell: RenderCell) => {
                if (playerViewPreview) return;
                if (placementCombatantId && activeCombat) {
                  const c = activeCombat.combatants.find((x) => x.id === placementCombatantId);
                  const dg = dungeon?.grid as number[][] | undefined;
                  const loc = dungeon?.locationType ?? "dungeon";
                  const tile = dg?.[gy]?.[gx];
                  const placeOk =
                    !!dg?.length && tile !== undefined && isDungeonGridWalkable(tile, loc);
                  if (c?.isAlive && placeOk) {
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
                  if (c?.isAlive && !placeOk) {
                    return;
                  }
                }
                if (fogPaintMode && dungeon?.grid) {
                  const key = `${gx},${gy}`;
                  setDmManualReveal((prev) => {
                    const next = new Set(prev);
                    if (shiftEraseRef.current) next.delete(key);
                    else next.add(key);
                    return next;
                  });
                  return;
                }
                const dgGrid = dungeon?.grid as number[][] | undefined;
                if (dgGrid && isDoorTile(dgGrid[gy]?.[gx])) {
                  setDmDoorOpen((prev) => toggleDoorOpenState(dgGrid, prev, `${gx},${gy}`));
                  return;
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
                if (cell.eType === "trap" && cell.extra && typeof cell.extra === "object") {
                  setMapEntityModal({
                    kind: "trap",
                    x: gx,
                    y: gy,
                    ent: cell.extra as Record<string, unknown>,
                  });
                  return;
                }
                if (
                  partyLeaderId &&
                  activeCombat &&
                  dungeon?.grid &&
                  !placementCombatantId
                ) {
                  const tile = (dungeon.grid as number[][])[gy]?.[gx];
                  if (
                    isDungeonGridWalkable(tile, dungeon?.locationType ?? "dungeon") &&
                    !cellBlocksPartyMarch(cell)
                  ) {
                    startPartyMarch(gx, gy);
                    return;
                  }
                }
                const r = dungeon.rooms.find(
                  (rm: { x: number; y: number; w: number; h: number; id: number }) =>
                    gx >= rm.x && gx < rm.x + rm.w && gy >= rm.y && gy < rm.y + rm.h,
                );
                if (r) {
                  if (selectedRoomId === r.id) {
                    setSelectedRoomId(null);
                    setMapCamera("global");
                  } else {
                    setSelectedRoomId(r.id);
                    setMapCamera("room");
                  }
                }
              }}
              onMapCellContextMenu={
                playerViewPreview
                  ? undefined
                  : (p) =>
                      setMapEncounterMenu({
                        cell: p.cell,
                        worldGx: p.worldGx,
                        worldGy: p.worldGy,
                        clientX: p.clientX,
                        clientY: p.clientY,
                      })
              }
            />
            </div>
            )
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
        {tokenHoverTip &&
          tokenHoverTip.tokens.length > 0 &&
          !laserPointerMode &&
          !fogPaintMode &&
          !playerViewPreview && (
          <div
            className="pointer-events-none fixed z-[200] max-w-[18rem] rounded border border-dnd-gold/35 bg-gray-950/95 px-2 py-1.5 text-[11px] leading-snug text-gray-100 shadow-xl"
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
              const line = c
                ? `${c.label} · ${role}`
                : `${t.label || "?"} · ${role}`;
              return <div key={t.id ?? `${t.gx}-${t.gy}-${t.label}`}>{line}</div>;
            })}
            {tokenHoverTip.tokens.some((t) => t.kind === "monster") && (
              <div className="mt-1 text-[10px] text-gray-500">Right-click for stat card</div>
            )}
            {(() => {
              const cell = tokenHoverTip.cell ?? null;
              const hideForgeMonsterLine =
                tokenHoverTip.tokens.some((x) => x.kind === "monster") && cell?.eType === "monster";
              if (hideForgeMonsterLine) return null;
              const ent = mapEntityCellHoverLines(cell);
              if (!ent?.length) return null;
              return (
                <div className="mt-1.5 border-t border-gray-700 pt-1.5 text-[10px] text-gray-300">
                  {ent.map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
        {mapCellHover &&
          mapCellHover.lines.length > 0 &&
          !laserPointerMode &&
          !fogPaintMode &&
          !playerViewPreview &&
          !tokenHoverTip && (
          <div
            className="pointer-events-none fixed z-[199] max-w-[18rem] rounded border border-cyan-800 bg-zinc-950 px-2 py-1.5 text-[11px] leading-snug text-zinc-50 shadow-xl ring-1 ring-black/30"
            style={{
              left: Math.min(
                mapCellHover.clientX + 14,
                (typeof window !== "undefined" ? window.innerWidth : 1200) - 16,
              ),
              top: mapCellHover.clientY + 14,
            }}
          >
            {mapCellHover.lines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1 text-xs">
          {(dungeon?.rooms ?? []).map(
            (r: { id: number; label?: string; type?: string; isSecretRoom?: boolean }) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  if (selectedRoomId === r.id) {
                    setSelectedRoomId(null);
                    setMapCamera("global");
                  } else {
                    setSelectedRoomId(r.id);
                    setMapCamera("room");
                  }
                }}
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

      {!dmRightSidebarCollapsed && workspaceWideLayout && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize map and sidebar"
          className="group relative hidden w-3 shrink-0 cursor-col-resize touch-none select-none lg:block"
          onPointerDown={onSidebarResizePointerDown}
        >
          <div className="mx-auto h-full w-px bg-gray-700 transition-colors group-hover:bg-dnd-gold/45" />
        </div>
      )}

      <div
        className={clsx(
          "dnd-card flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-hidden",
          dmRightSidebarCollapsed
            ? "w-full lg:max-w-[2.75rem] lg:min-w-0 lg:items-center lg:py-2"
            : "w-full lg:min-w-0",
        )}
        style={
          !dmRightSidebarCollapsed && workspaceWideLayout
            ? {
                width: dmSidebarWidthPx,
                minWidth: DM_PLAY_SIDEBAR_MIN_PX,
                maxWidth: "min(720px, 58vw)",
              }
            : undefined
        }
      >
        {dmRightSidebarCollapsed ? (
          <button
            type="button"
            className="flex min-h-[8rem] w-full flex-col items-center justify-start gap-2 rounded border border-gray-700 bg-gray-900/40 p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            title="Show rolls, combat, and room notes"
            onClick={() => setDmRightSidebarCollapsed(false)}
          >
            <ChevronLeft size={18} className="shrink-0" />
            <span className="hidden text-[9px] font-semibold uppercase leading-tight tracking-wide sm:block [writing-mode:vertical-rl]">
              Sidebar
            </span>
          </button>
        ) : (
          <>
            <div className="flex shrink-0 items-center justify-end gap-2 border-b border-gray-800 pb-2 lg:justify-between">
              <div className="hidden flex-wrap gap-1 lg:flex">
                <button
                  type="button"
                  className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800"
                  onClick={() => {
                    setDmSecRolls(true);
                    setDmSecCombat(true);
                    setDmSecRoom(true);
                  }}
                >
                  Expand all
                </button>
                <button
                  type="button"
                  className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400 hover:bg-gray-800"
                  onClick={() => {
                    setDmSecRolls(false);
                    setDmSecCombat(false);
                    setDmSecRoom(false);
                  }}
                >
                  Collapse all
                </button>
              </div>
              <button
                type="button"
                className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                title="Minimize sidebar"
                onClick={() => setDmRightSidebarCollapsed(true)}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="hidden shrink-0 gap-1 lg:flex">
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

            {launchMsg && <div className="shrink-0 text-xs text-amber-200/90">{launchMsg}</div>}

            {activeCombat ? <ConcentrationDmBanner /> : null}

            {workspaceWideLayout && (
              <div className="shrink-0 border-b border-gray-800 pb-2 lg:border-0 lg:pb-0">
                <button
                  type="button"
                  className="mb-1 flex w-full items-center justify-between gap-2 text-left lg:mb-0"
                  onClick={() => setDmSecRolls((v) => !v)}
                >
                  <span className="dnd-label text-xs">What to roll (party &amp; DM)</span>
                  {dmSecRolls ? <ChevronUp size={14} className="shrink-0 text-gray-500" /> : <ChevronDown size={14} className="shrink-0 text-gray-500" />}
                </button>
              </div>
            )}

            <div
              className={clsx(
                "min-h-0 flex-1 overflow-auto",
                pane === "rolls" || !workspaceWideLayout ? "block" : "hidden",
                dmSecRolls || !workspaceWideLayout ? "lg:block lg:min-h-[180px]" : "lg:hidden",
              )}
            >
              <div className="min-h-0 w-full">
                <InlineRollHelper />
              </div>
            </div>

            {activeCombat && (
              <>
                <div
                  className={clsx("shrink-0 border-t border-gray-800 pt-2", !workspaceWideLayout && "hidden")}
                >
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left"
                    onClick={() => setDmSecCombat((v) => !v)}
                  >
                    <span className="dnd-label text-xs">Combat</span>
                    {dmSecCombat ? <ChevronUp size={14} className="shrink-0 text-gray-500" /> : <ChevronDown size={14} className="shrink-0 text-gray-500" />}
                  </button>
                </div>
                <div
                  className={clsx(
                    "min-h-0 flex-1 overflow-auto",
                    workspaceWideLayout && pane === "combat" ? "block" : "hidden",
                    dmSecCombat ? "lg:block lg:min-h-[200px]" : "lg:hidden",
                  )}
                >
                  <div className="min-h-0 w-full">
                    <InlineCombatPanel />
                  </div>
                </div>
              </>
            )}

            {!activeCombat && (
              <div
                className={clsx(
                  "shrink-0 border-t border-gray-800 pt-2 max-lg:hidden",
                  pane === "combat" ? "block" : "hidden",
                  dmSecCombat ? "lg:block" : "lg:hidden",
                )}
              >
                <button
                  type="button"
                  className="mb-2 flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setDmSecCombat((v) => !v)}
                >
                  <span className="dnd-label text-xs">Ad-hoc encounter</span>
                  {dmSecCombat ? <ChevronUp size={14} className="shrink-0 text-gray-500" /> : <ChevronDown size={14} className="shrink-0 text-gray-500" />}
                </button>
                {dmSecCombat && <StartCombatPanel />}
              </div>
            )}

            <div className="shrink-0 border-t border-gray-800 pt-2">
              <button
                type="button"
                className="mb-1 flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-gray-400 hover:text-gray-200"
                onClick={() => setDmSecRoom((v) => !v)}
              >
                <span>Room notes &amp; scripted content</span>
                {dmSecRoom ? <ChevronUp size={14} className="shrink-0" /> : <ChevronDown size={14} className="shrink-0" />}
              </button>
              {dmSecRoom && (
          <div className="mt-2 max-h-56 overflow-y-auto text-xs">
            {!room ? (
              <p className="italic text-gray-500">
                {workspaceWideLayout ? (
                  <>
                    Click the map or a room chip to focus notes and the camera. Right-click creatures, loot, traps, or
                    riddles on the map for quick actions.
                  </>
                ) : (
                  <>
                    Open <b>Map &amp; player TV</b> at the bottom of this panel to focus a room, or use the map on a
                    large screen.
                  </>
                )}
              </p>
            ) : (
              <>
                <h3 className="font-display font-bold text-dnd-gold">
                  {(room as { isSecretRoom?: boolean }).isSecretRoom ? (
                    <span className="mr-2 rounded border border-cyan-500/60 bg-cyan-950/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-200">
                      Secret
                    </span>
                  ) : null}
                  {room.namedRoom || `Room ${room.id}`} — {room.label || room.type}
                </h3>
                {(room as { secretHint?: string | null }).secretHint ? (
                  <p className="mt-1 text-[11px] text-cyan-200/90">
                    Secret clue (DM): {(room as { secretHint?: string }).secretHint}
                  </p>
                ) : null}
                <p className="text-[11px] text-gray-500">
                  {room.w}×{room.h} · {roomEntities.length} entities
                </p>
                {roomEntities.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[11px] text-gray-400">
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
                            <span className="mt-0.5 block pl-1 text-[10px] leading-snug text-gray-500">
                              Spot DC {e.detectDC ?? "—"} · {e.saveType || "?"} DC {e.saveDC ?? "—"}
                              {e.dmg ? ` · ${e.dmg}` : ""}
                              {e.effect ? ` — ${e.effect}` : ""}
                            </span>
                          ) : null}
                          {e.type === "riddle" ? (
                            <span className="mt-0.5 block pl-1 text-[10px] leading-snug text-purple-200/95">
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
                {roomMonsters.length === 0 && (
                  <div className="mt-2 text-[11px] italic text-gray-500">No monsters scripted for this room.</div>
                )}
                {roomMonsters.length > 0 && !activeCombat && (
                  <div className="mt-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => void launchCombatForRoom()}
                      disabled={launching}
                      className={clsx(
                        "btn-primary flex w-full items-center justify-center gap-2 text-xs",
                        launching && "opacity-60",
                      )}
                    >
                      <Sword size={14} />{" "}
                      {launching
                        ? "Starting…"
                        : `Start combat (${roomMonsters.reduce((a: number, m: { count?: number }) => a + (m.count || 1), 0)} foes)`}
                    </button>
                  </div>
                )}
                {roomMonsters.length > 0 && activeCombat && (
                  <div className="mt-2 space-y-1">
                    <button
                      type="button"
                      onClick={() => void appendRoomMonstersToActiveCombat()}
                      disabled={launching}
                      className={clsx(
                        "btn-primary flex w-full items-center justify-center gap-2 text-xs",
                        launching && "opacity-60",
                      )}
                    >
                      <Sword size={14} />{" "}
                      {launching
                        ? "Adding…"
                        : `Add all room monsters (${roomMonsters.reduce((a: number, m: { count?: number }) => a + (m.count || 1), 0)})`}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
              )}
            </div>

            <details className="shrink-0 max-lg:mt-2 max-lg:rounded-lg max-lg:border max-lg:border-gray-800/80 max-lg:bg-gray-950/40 max-lg:px-2 max-lg:py-1.5 lg:hidden">
              <summary className="cursor-pointer list-none text-xs font-display text-gray-300">
                <span className="text-dnd-gold/90">Map &amp; player TV</span>
                <span className="ml-1.5 text-[10px] text-gray-500">(sync, room for notes)</span>
              </summary>
              <div className="mt-2 space-y-2 border-t border-gray-800/80 pt-2">
                <DmPlayTvSyncPanel
                  tvId={dmTvId}
                  onTvIdChange={setDmTvId}
                  onApplyTvId={() => {
                    const t = dmTvId.trim();
                    if (!TV_ID_PATTERN.test(t)) {
                      setTvSyncStatus("TV id may only use letters, numbers, _ or - (max 32).");
                      return;
                    }
                    try {
                      localStorage.setItem("dnd5e_last_tv", t);
                    } catch {
                      /* ignore */
                    }
                    setTvSyncStatus(`Saved TV id “${t}”. Use the sync buttons to push.`);
                  }}
                  onSyncView={() => void runTvSync(true)}
                  onSyncFull={() => void runTvSync(false)}
                  busy={tvSyncBusy}
                  status={tvSyncStatus}
                  layout="compact"
                />
                {dungeon && Array.isArray((dungeon as { rooms?: { id: number; label?: string; type?: string; isSecretRoom?: boolean }[] }).rooms) && (dungeon as { rooms: unknown[] }).rooms.length > 0 && (
                  <div>
                    <label className="dnd-label mb-1 block text-xs">Focus room (notes &amp; camera)</label>
                    <select
                      className="input-field w-full text-sm"
                      value={selectedRoomId == null ? "" : String(selectedRoomId)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "") {
                          setSelectedRoomId(null);
                          setMapCamera("global");
                        } else {
                          setSelectedRoomId(Number(v));
                          setMapCamera("room");
                        }
                      }}
                    >
                      <option value="">Whole map / none</option>
                      {(
                        (dungeon as { rooms: { id: number; label?: string; type?: string; isSecretRoom?: boolean }[] })
                          .rooms
                      ).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.isSecretRoom ? "★ " : ""}
                          {r.id}. {r.label || r.type}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </details>
          </>
        )}
      </div>
    </div>

    {mapEncounterMenu && (
      <>
        <button
          type="button"
          className="fixed inset-0 z-[150] cursor-default bg-black/50"
          aria-label="Close menu"
          onClick={() => setMapEncounterMenu(null)}
        />
        <div
          className="fixed z-[160] min-w-[12rem] max-w-[90vw] rounded border border-zinc-600 bg-zinc-950 p-2 text-xs text-zinc-100 shadow-2xl ring-1 ring-black/40"
          style={{
            left: Math.min(
              mapEncounterMenu.clientX,
              (typeof window !== "undefined" ? window.innerWidth : 800) - 220,
            ),
            top: Math.min(
              mapEncounterMenu.clientY,
              (typeof window !== "undefined" ? window.innerHeight : 600) - 280,
            ),
          }}
        >
          {mapEncounterMenu.cell.eType === "monster" ? (
            <>
              <p className="mb-2 font-semibold text-dnd-gold">Map creature</p>
              {!activeCombat && partyCharacters.length > 0 && (
                <button
                  type="button"
                  disabled={launching}
                  className="mb-2 w-full rounded border border-dnd-gold/50 bg-dnd-gold/10 px-2 py-1.5 text-left text-dnd-gold hover:bg-dnd-gold/20 disabled:opacity-50"
                  onClick={() => void startCombatFromMapMonsterCell()}
                >
                  {launching ? "Starting…" : "Start combat (party + this creature)"}
                </button>
              )}
              {!activeCombat && partyCharacters.length === 0 && (
                <p className="mb-2 text-[11px] text-gray-500">Add party members on the Party step first.</p>
              )}
              {activeCombat && (
                <>
                  <button
                    type="button"
                    disabled={launching}
                    className="mb-2 w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-left text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
                    onClick={() => void addCellMonsterToInitiative()}
                  >
                    {launching ? "Adding…" : "Add this creature to initiative"}
                  </button>
                  <button
                    type="button"
                    disabled={launching}
                    className="mb-2 w-full rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-left text-zinc-100 hover:bg-zinc-800 disabled:opacity-50"
                    onClick={() => void addAllRoomMonstersAtMenuPosition()}
                  >
                    {launching ? "Adding…" : "Add all monsters in this room"}
                  </button>
                </>
              )}
            </>
          ) : mapEncounterMenu.cell.eType === "trap" ? (
            (() => {
              const ex = mapEncounterMenu.cell.extra as Record<string, unknown>;
              const dice = trapDamageDiceFromText(String(ex.dmg ?? ""));
              const detect = ex.detectDC != null ? String(ex.detectDC) : "—";
              const saveT = String(ex.saveType ?? "DEX");
              const saveDc = ex.saveDC != null ? String(ex.saveDC) : "—";
              return (
                <>
                  <p className="mb-1 font-semibold text-amber-200/90">Trap</p>
                  {ex.name ? <p className="text-[11px] text-gray-200">{String(ex.name)}</p> : null}
                  <div className="mb-2 space-y-1 rounded border border-zinc-700 bg-zinc-900 p-2 text-[10px] text-zinc-200">
                    <p>
                      <span className="font-semibold text-zinc-100">Notice (before it fires):</span> compare passive
                      Perception or an active check to <span className="text-white">DC {detect}</span> (Perception to
                      spot, Investigation to study mechanisms, etc.).
                    </p>
                    <p>
                      <span className="font-semibold text-zinc-100">If it triggers:</span>{" "}
                      <span className="text-white">{saveT}</span> save <span className="text-white">DC {saveDc}</span>
                      {ex.dmg ? (
                        <>
                          {" "}
                          — on a failed save, typical damage:{" "}
                          <span className="text-amber-200">{String(ex.dmg)}</span>
                        </>
                      ) : null}
                    </p>
                    {ex.saveDC != null && (
                      <p className="text-[10px] text-amber-100">
                        {saveT} save DC {saveDc} — half damage on success. Roll damage once, halve it for saves.
                      </p>
                    )}
                    {ex.effect ? <p className="text-zinc-400">{String(ex.effect)}</p> : null}
                  </div>
                  {dice ? (
                    <div className="mb-2 space-y-1">
                      <button
                        type="button"
                        className="w-full rounded border border-amber-600 bg-amber-950 px-2 py-1.5 text-left text-amber-50 hover:bg-amber-900"
                        onClick={() => {
                          const r = rollMonsterDamage(dice, 0);
                          setTrapMenuDamageRoll(r);
                        }}
                      >
                        Roll damage ({dice})
                      </button>
                      {trapMenuDamageRoll ? (
                        <p className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-100">
                          {trapMenuDamageRoll.breakdown}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mb-2 text-[10px] text-gray-500">No NdM damage in this trap text — apply harm manually.</p>
                  )}
                  {activeCombat && playerCombatants.length > 0 ? (
                    <div className="mb-2 space-y-1">
                      <label className="block text-[10px] text-gray-500">
                        Apply rolled damage to
                        <select
                          className="input-field mt-0.5 w-full py-1 text-xs"
                          value={trapDmTargetId}
                          onChange={(e) => setTrapDmTargetId(e.target.value)}
                        >
                          {playerCombatants
                            .filter((c) => c.type === "player" && c.isAlive)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={!trapDmTargetId || trapMenuDamageRoll == null}
                        className="w-full rounded border border-red-800 bg-red-950 px-2 py-1.5 text-left text-red-50 hover:bg-red-900 disabled:opacity-40"
                        onClick={() => {
                          if (!trapMenuDamageRoll || !trapDmTargetId) return;
                          void damageCombatant(trapDmTargetId, trapMenuDamageRoll.total);
                          setMapEncounterMenu(null);
                        }}
                      >
                        Apply {trapMenuDamageRoll ? trapMenuDamageRoll.total : "—"} damage to selected character
                      </button>
                    </div>
                  ) : (
                    <p className="mb-2 text-[10px] text-gray-500">
                      Start combat with party members to apply trap damage from here.
                    </p>
                  )}
                </>
              );
            })()
          ) : (
            <p className="text-[11px] text-gray-400">Left-click this tile for full details.</p>
          )}
          <button
            type="button"
            className="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 py-1.5 text-[11px] font-medium text-zinc-100 hover:bg-zinc-700"
            onClick={() => setMapEncounterMenu(null)}
          >
            Close
          </button>
        </div>
      </>
    )}

    {marchMenu && activeCombat && (
      <>
        <button
          type="button"
          className="fixed inset-0 z-[150] cursor-default bg-black/50"
          aria-label="Close menu"
          onClick={() => setMarchMenu(null)}
        />
        <div
          className="fixed z-[160] min-w-[14rem] max-w-[90vw] rounded border border-zinc-600 bg-zinc-950 p-2 text-xs text-zinc-100 shadow-2xl ring-1 ring-black/40"
          style={{
            left: Math.min(
              marchMenu.clientX,
              (typeof window !== "undefined" ? window.innerWidth : 800) - 220,
            ),
            top: Math.min(
              marchMenu.clientY,
              (typeof window !== "undefined" ? window.innerHeight : 600) - 240,
            ),
          }}
        >
          <p className="mb-2 font-semibold text-dnd-gold">
            {activeCombat.combatants.find((c) => c.id === marchMenu.tokenId)?.label ?? "Token"}
          </p>
          <button
            type="button"
            className="mb-3 w-full rounded border border-dnd-gold/50 bg-dnd-gold/10 px-2 py-1.5 text-left font-medium text-dnd-gold hover:bg-dnd-gold/20"
            onClick={() => {
              setPartyLeaderId(marchMenu.tokenId);
              setMarchMenu(null);
            }}
          >
            Set as march leader (TV follows)
          </button>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-zinc-400">Follow when marching</p>
          <div className="space-y-1.5">
            {playerCombatants
              .filter((c) => c.id !== (partyLeaderId ?? marchMenu.tokenId))
              .map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-[11px]">
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
                  <span>{c.label}</span>
                </label>
              ))}
          </div>
          {playerCombatants.filter((c) => c.id !== (partyLeaderId ?? marchMenu.tokenId)).length === 0 && (
            <p className="text-[10px] text-zinc-400">No other PCs in combat.</p>
          )}
        </div>
      </>
    )}

    {monsterTokenMenu && activeCombat && (
      <>
        <button
          type="button"
          className="fixed inset-0 z-[150] cursor-default bg-black/50"
          aria-label="Close menu"
          onClick={() => setMonsterTokenMenu(null)}
        />
        <div
          className="fixed z-[160] min-w-[14rem] max-w-[90vw] rounded border border-zinc-600 bg-zinc-950 p-2 text-xs text-zinc-100 shadow-2xl ring-1 ring-black/40"
          style={{
            left: Math.min(
              monsterTokenMenu.clientX,
              (typeof window !== "undefined" ? window.innerWidth : 800) - 220,
            ),
            top: Math.min(
              monsterTokenMenu.clientY,
              (typeof window !== "undefined" ? window.innerHeight : 600) - 200,
            ),
          }}
        >
          {(() => {
            const mc = activeCombat.combatants.find((c) => c.id === monsterTokenMenu.combatantId);
            if (!mc || mc.type !== "monster") {
              return <p className="text-gray-400">No monster data for this token.</p>;
            }
            return (
              <>
                <p className="mb-2 font-semibold text-dnd-gold">{mc.label}</p>
                {mc.monsterSlug ? (
                  <button
                    type="button"
                    className="mb-2 w-full rounded border border-dnd-gold/50 bg-dnd-gold/10 px-2 py-1.5 text-left text-dnd-gold hover:bg-dnd-gold/20"
                    onClick={() => {
                      setMonsterStatCardSlug(mc.monsterSlug!);
                      setMonsterTokenMenu(null);
                    }}
                  >
                    View stat card
                  </button>
                ) : (
                  <p className="mb-2 text-[11px] text-gray-500">No compendium slug on this combatant.</p>
                )}
                <button
                  type="button"
                  className="mt-1 w-full rounded border border-zinc-600 bg-zinc-800 py-1.5 text-[11px] font-medium text-zinc-100 hover:bg-zinc-700"
                  onClick={() => setMonsterTokenMenu(null)}
                >
                  Close
                </button>
              </>
            );
          })()}
        </div>
      </>
    )}

    {monsterStatCardSlug && (
      <MonsterStatCard slug={monsterStatCardSlug} initialView="dm" onClose={() => setMonsterStatCardSlug(null)} />
    )}

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

    {mapEntityModal?.kind === "trap" && (
      <Modal
        title={`Trap: ${String(mapEntityModal.ent.name ?? "Hazard")}`}
        onClose={() => setMapEntityModal(null)}
        footer={
          <>
            <button type="button" onClick={() => setMapEntityModal(null)} className="btn-secondary">
              Close
            </button>
            {activeCombat && playerCombatants.length > 0 && trapModalRoll && trapModalTargetId ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  void damageCombatant(trapModalTargetId, trapModalRoll.total);
                  setMapEntityModal(null);
                }}
              >
                Apply {trapModalRoll.total} damage
              </button>
            ) : null}
          </>
        }
      >
        {(() => {
          const ex = mapEntityModal.ent;
          const dice = trapDamageDiceFromText(String(ex.dmg ?? ""));
          const detect = ex.detectDC != null ? String(ex.detectDC) : "—";
          const saveT = String(ex.saveType ?? "DEX");
          const saveDc = ex.saveDC != null ? String(ex.saveDC) : "—";
          return (
            <div className="space-y-3 text-sm text-gray-300">
              <div className="space-y-1 rounded border border-amber-900/40 bg-amber-950/20 p-3 text-xs text-gray-400">
                <p>
                  <span className="font-semibold text-gray-200">Notice:</span> DC {detect} (passive Perception or active
                  Perception / Investigation before it fires).
                </p>
                <p>
                  <span className="font-semibold text-gray-200">Save if triggered:</span> {saveT} DC {saveDc}
                  {ex.dmg ? (
                    <>
                      {" "}
                      — damage on a failed save: <span className="text-amber-100/90">{String(ex.dmg)}</span>
                    </>
                  ) : null}
                </p>
                {ex.saveDC != null && (
                  <p className="text-[10px] text-amber-200/70">
                    {saveT} save DC {saveDc} — half damage on success. Roll damage once, halve it for saves.
                  </p>
                )}
                {ex.effect ? <p className="text-gray-500">{String(ex.effect)}</p> : null}
              </div>
              {dice ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    className="rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-100/90 hover:bg-amber-950/50"
                    onClick={() => setTrapModalRoll(rollMonsterDamage(dice, 0))}
                  >
                    Roll damage ({dice})
                  </button>
                  {trapModalRoll ? (
                    <p className="font-mono text-xs text-gray-200">{trapModalRoll.breakdown}</p>
                  ) : null}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No dice pattern found in the damage text.</p>
              )}
              {activeCombat && playerCombatants.length > 0 ? (
                <label className="block text-xs text-gray-500">
                  Apply to
                  <select
                    className="input-field mt-1 w-full"
                    value={trapModalTargetId}
                    onChange={(e) => setTrapModalTargetId(e.target.value)}
                  >
                    {playerCombatants
                      .filter((c) => c.type === "player" && c.isAlive)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                  </select>
                </label>
              ) : (
                <p className="text-xs text-gray-500">Start combat to apply damage to a character from this dialog.</p>
              )}
            </div>
          );
        })()}
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
    const dexMod = Math.floor(((m.dexterity ?? 10) - 10) / 2);
    for (let i = 1; i <= count; i++) {
      setMonsters((prev) => [
        ...prev,
        {
          slug: m.slug,
          label: `${m.name}${count > 1 ? ` ${i}` : ""}`,
          hp: m.hitPoints,
          ac: m.armorClass,
          initiative: Math.floor(Math.random() * 20) + 1 + dexMod,
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
    const missing = partyCharacters.filter((c) => !(c.id in initiatives));
    if (missing.length > 0) {
      alert(`Please enter initiative for: ${missing.map((c) => c.name).join(", ")}`);
      return;
    }
    const combatants = [
      ...partyCharacters.map((char) => ({
        type: "player" as const,
        characterId: char.id,
        label: char.name,
        initiative: initiatives[char.id] ?? 0,
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

function ConcentrationDmBanner() {
  const { concentrationBanner, clearConcentrationBanner, rollSummary } = useSessionStore();
  if (!concentrationBanner) return null;
  const concSaveBonus =
    concentrationBanner.characterId != null
      ? rollSummary?.playerRolls.find((p) => p.characterId === concentrationBanner.characterId)?.keyRolls.saves
          .constitution.bonus
      : undefined;
  return (
    <div className="dnd-card mb-3 flex flex-wrap items-start justify-between gap-2 border-amber-700/50 bg-amber-950/40 px-3 py-2">
      <p className="text-sm text-amber-100">
        <span className="font-display font-semibold text-amber-200">{concentrationBanner.name}</span> is concentrating.{" "}
        <span className="text-amber-50">
          CON save DC {concentrationBanner.dc} (d20
          {concSaveBonus != null ? formatModifier(concSaveBonus) : " + CON mod"}). Failure = concentration ends.
        </span>
      </p>
      <button type="button" className="btn-secondary shrink-0 text-xs" onClick={() => clearConcentrationBanner()}>
        Dismiss
      </button>
    </div>
  );
}

// ── Inline combat (was Combat tab) ──────────────────────────────
function InlineCombatPanel() {
  const {
    activeCombat,
    nextTurn,
    endCombat,
    damageCombatant,
    healCombatant,
    updateCombatant,
  } = useSessionStore();
  const [dmgInputs, setDmgInputs] = useState<Record<string, string>>({});
  const [selectedCombatantId, setSelectedCombatantId] = useState<string | null>(null);
  const [collapsedMonsterGroups, setCollapsedMonsterGroups] = useState<Record<string, boolean>>({});

  const sorted = activeCombat
    ? [...activeCombat.combatants].sort((a, b) => b.initiative - a.initiative)
    : [];
  const alive = sorted.filter((c) => c.isAlive);
  const alivePlayers = alive.filter((c) => c.type === "player").length;
  const aliveMonsters = alive.filter((c) => c.type === "monster").length;
  const currentIdx = activeCombat?.currentTurnIndex ?? 0;
  const current = alive[currentIdx] ?? alive[0] ?? null;
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
        void nextTurn();
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
  }, [selectedCombatant, nextTurn, damageCombatant, healCombatant]);

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
            <button type="button" onClick={() => void nextTurn()} className="btn-primary flex items-center gap-2">
              <SkipForward size={15} /> Next Turn ▶
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
                  isCurrentTurn={c.id === current?.id}
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
                    if (cond === "exhaustion") {
                      const has = c.conditions.some((x) => /^exhaustion/.test(x));
                      void updateCombatant(c.id, {
                        conditions: has
                          ? c.conditions.filter((x) => !/^exhaustion/.test(x))
                          : [...c.conditions.filter((x) => !/^exhaustion/.test(x)), "exhaustion:1"],
                      });
                      return;
                    }
                    const has = c.conditions.includes(cond);
                    void updateCombatant(c.id, {
                      conditions: has ? c.conditions.filter((x) => x !== cond) : [...c.conditions, cond],
                    });
                  }}
                  onSetExhaustionLevel={(level) => {
                    void updateCombatant(c.id, {
                      conditions: [
                        ...c.conditions.filter((x) => !/^exhaustion/.test(x)),
                        `exhaustion:${level}`,
                      ],
                    });
                  }}
                  onConfirmRemovedFromInitiative={() =>
                    void updateCombatant(c.id, { isAlive: false })
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PLAY_COMBAT_CONDITIONS = [
  "blinded",
  "charmed",
  "deafened",
  "exhaustion",
  "frightened",
  "grappled",
  "incapacitated",
  "invisible",
  "paralyzed",
  "petrified",
  "poisoned",
  "prone",
  "restrained",
  "stunned",
  "unconscious",
] as const;

function playConditionLabel(cond: string): string {
  const m = /^exhaustion:(\d)$/.exec(cond);
  if (m) return `exhaustion ${m[1]}`;
  return cond;
}

function playConditionActive(conditions: string[], slug: string): boolean {
  if (slug === "exhaustion") return conditions.some((x) => /^exhaustion/.test(x));
  return conditions.includes(slug);
}

function exhaustionLevelFromConditions(conditions: string[]): number {
  for (const x of conditions) {
    const m = /^exhaustion:(\d)$/.exec(x);
    if (m) return Math.min(6, Math.max(1, parseInt(m[1]!, 10)));
  }
  return 1;
}

function CombatantRow({
  combatant: c,
  isCurrentTurn,
  isSelected,
  onSelect,
  dmgInput,
  onDmgChange,
  onDamage,
  onHeal,
  onToggleCondition,
  onSetExhaustionLevel,
  onConfirmRemovedFromInitiative,
}: {
  combatant: Combatant;
  isCurrentTurn: boolean;
  isSelected: boolean;
  onSelect: () => void;
  dmgInput: string;
  onDmgChange: (v: string) => void;
  onDamage: (amount?: number) => void;
  onHeal: (amount?: number) => void;
  onToggleCondition: (c: string) => void;
  onSetExhaustionLevel: (level: number) => void;
  onConfirmRemovedFromInitiative: () => void;
}) {
  const [expanded, setExpanded] = useState(isCurrentTurn);
  const hpPct = Math.round((c.currentHp / c.maxHp) * 100);
  const amount = parseInt(dmgInput || "0", 10) || 0;
  const applyQuickDamage = (n: number) => onDamage(n);
  const applyQuickHeal = (n: number) => onHeal(n);
  const exhaustionOn = playConditionActive(c.conditions, "exhaustion");

  return (
    <div
      className={clsx(
        "overflow-hidden rounded-lg border transition-all",
        isCurrentTurn ? "border-dnd-gold shadow-[0_0_8px_rgba(212,172,13,0.2)]" : "border-gray-700",
        isSelected && "ring-1 ring-blue-500/40",
        !c.isAlive && "opacity-50",
      )}
      onClick={onSelect}
    >
      <div
        className={clsx(
          "flex flex-wrap items-center gap-3 px-3 py-2",
          isCurrentTurn ? "bg-dnd-dark/90 ring-1 ring-dnd-gold/20" : "bg-dnd-dark",
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
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-display font-bold text-white">{c.label}</span>
            {c.type === "monster" && <Skull size={12} className="flex-shrink-0 text-red-400" />}
            {isCurrentTurn && (
              <span className="rounded border border-dnd-gold/40 bg-dnd-gold/20 px-1.5 py-0.5 font-display text-[10px] text-dnd-gold">
                TURN
              </span>
            )}
            {c.currentHp === 0 && c.type === "player" && c.isAlive && (
              <span className="rounded border border-red-700 bg-red-950 px-1.5 py-0.5 font-display text-[10px] text-red-300 animate-pulse">
                DYING — roll death saves on their turn
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
                className="rounded border border-red-800 bg-red-950 px-1.5 py-0.5 font-display text-xs capitalize text-red-300"
              >
                {playConditionLabel(cond)}
              </span>
            ))}
            {c.currentHp === 0 && c.isAlive && (
              <button
                type="button"
                className="rounded border border-gray-600 bg-gray-900 px-1.5 py-0.5 font-display text-[10px] text-gray-300 hover:bg-gray-800"
                onClick={(e) => {
                  e.stopPropagation();
                  onConfirmRemovedFromInitiative();
                }}
              >
                {c.type === "player" ? "Confirm death (3 failures)" : "Mark defeated"}
              </button>
            )}
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
          <div className="flex flex-wrap items-center gap-1">
            {PLAY_COMBAT_CONDITIONS.map((cond) => (
              <span key={cond} className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCondition(cond);
                  }}
                  className={clsx(
                    "rounded border px-2 py-0.5 font-display text-xs capitalize transition-colors",
                    playConditionActive(c.conditions, cond)
                      ? "border-red-700 bg-red-950 text-red-300"
                      : "border-gray-700 text-gray-500 hover:border-gray-500",
                  )}
                >
                  {cond}
                </button>
                {cond === "exhaustion" && exhaustionOn && (
                  <input
                    type="number"
                    min={1}
                    max={6}
                    title="Exhaustion level (PHB)"
                    className="input-field w-11 py-0.5 text-center text-[10px]"
                    value={exhaustionLevelFromConditions(c.conditions)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const n = Math.min(6, Math.max(1, parseInt(e.target.value, 10) || 1));
                      onSetExhaustionLevel(n);
                    }}
                  />
                )}
              </span>
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
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-base font-bold text-dnd-gold sm:text-lg">What to roll</h2>
        <button
          type="button"
          onClick={() => void refreshRolls()}
          className="shrink-0 text-gray-500 hover:text-white"
          title="Refresh from session"
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-1">
        <div className="space-y-3">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-blue-400/95">Party</h3>
          {rollSummary.playerRolls.map((p) => (
            <PlayerRollCard key={p.characterId} info={p} />
          ))}
        </div>

        <div className="space-y-3">
          <h3 className="font-display text-sm font-bold uppercase tracking-wide text-red-400/95">You (DM)</h3>
          {rollSummary.dmRolls.map((d) => (
            <DmRollCard key={d.combatantId} info={d as DmRollInfo} />
          ))}
          {rollSummary.dmRolls.length === 0 && (
            <p className="text-sm italic text-gray-500">No monsters in combat.</p>
          )}
        </div>
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
  const combatants = activeCombat?.combatants ?? [];
  const playerTargets =
    combatants
      .filter((c) => c.type === "player" && c.isAlive)
      .map((c) => ({ id: c.id, label: c.label, armorClass: c.armorClass })) ?? [];
  const legendary = info.legendaryActions ?? [];
  const legPts = info.legendaryActionPoints ?? 3;

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
        <p className="dnd-label text-[10px] text-gray-500">Actions</p>
        {info.actions.slice(0, 8).map((action, i) => (
          <DmMonsterActionRow
            key={`${info.combatantId}-a-${i}-${action.name}`}
            action={action}
            playerTargets={playerTargets}
            combatants={combatants}
          />
        ))}
      </div>
      {legendary.length > 0 && (
        <div className="mt-3 space-y-2 border-t border-red-950 pt-3">
          <p className="dnd-label text-[10px] text-amber-200/90">
            Legendary Actions ({legPts} pts/round — taken at end of others&apos; turns)
          </p>
          {legendary.slice(0, 8).map((action, i) => (
            <DmMonsterActionRow
              key={`${info.combatantId}-l-${i}-${action.name}`}
              action={action}
              playerTargets={playerTargets}
              combatants={combatants}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DmMonsterActionRow({
  action,
  playerTargets,
  combatants,
}: {
  action: DmRollInfo["actions"][number];
  playerTargets: { id: string; label: string; armorClass: number }[];
  combatants: Combatant[];
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

  const targetAc =
    targetId && combatants.length > 0
      ? combatants.find((x) => x.id === targetId)?.armorClass ?? null
      : null;

  let hitLabel: "HIT" | "MISS" | "ROLLED" | "CRITICAL HIT" | "AUTO-MISS" | null = null;
  if (attack) {
    if (attack.crit) hitLabel = "CRITICAL HIT";
    else if (attack.critFail) hitLabel = "AUTO-MISS";
    else if (targetAc !== null) hitLabel = attack.total >= targetAc ? "HIT" : "MISS";
    else hitLabel = "ROLLED";
  }

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

  const hitColor =
    hitLabel === "HIT" || hitLabel === "CRITICAL HIT"
      ? "text-green-300"
      : hitLabel === "MISS" || hitLabel === "AUTO-MISS"
        ? "text-gray-500"
        : "text-dnd-gold";

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

      {action.saveDc != null && (
        <p className="mt-1 text-[10px] text-amber-200/70">
          {action.saveType ?? "Save"} save DC {action.saveDc} — half damage on success. Roll damage once, halve it for
          saves.
        </p>
      )}

      <div className="mt-1.5 space-y-1.5 border-t border-gray-800 pt-1.5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <label className="dnd-label text-[9px]">Target (attack vs AC / apply damage)</label>
          <select
            className="input-field max-w-full py-0.5 text-[11px]"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            disabled={playerTargets.length === 0}
          >
            {playerTargets.length === 0 ? (
              <option value="">No players in combat</option>
            ) : (
              playerTargets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} (AC {p.armorClass})
                </option>
              ))
            )}
          </select>
        </div>

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
        <p className={clsx("mt-1 font-mono text-[11px]", hitColor)}>
          <span className="font-display font-semibold">
            {hitLabel === "CRITICAL HIT"
              ? "CRITICAL HIT"
              : hitLabel === "AUTO-MISS"
                ? "AUTO-MISS"
                : hitLabel}{" "}
          </span>
          <span className="text-dnd-gold">{attack.total}</span>
          <span className="text-gray-500">
            {" "}
            (d20 {attack.d20}
            {formatModifier(attack.bonus)})
          </span>
          {targetAc !== null && !attack.crit && !attack.critFail && (
            <span className="text-gray-600"> vs AC {targetAc}</span>
          )}
        </p>
      )}

      {dmg && (
        <p className="mt-0.5 font-mono text-[11px] text-red-200">
          Damage {dmg.total} — {dmg.breakdown}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-end gap-1.5">
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
