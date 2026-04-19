/**
 * Shared shape for DM → player TV (/dungeons/player) map sync.
 * Stored in localStorage + BroadcastChannel("dnd5e-player-map").
 */

export type PlayerDungeonData = {
  grid: number[][];
  rooms: Array<{
    id: number;
    x: number;
    y: number;
    w: number;
    h: number;
    cx: number;
    cy: number;
    [k: string]: unknown;
  }>;
  width?: number;
  height?: number;
  mapName?: string;
  entities?: Array<{ x: number; y: number; type: string; [k: string]: unknown }>;
  decoOverlay?: Array<{ x: number; y: number; ch: string; [k: string]: unknown }>;
  locationType?: string;
  floor?: number;
  glyphs?: Record<string, string>;
};

export type BattleToken = {
  /** Grid X (full dungeon coordinates). */
  gx: number;
  gy: number;
  label: string;
  kind: "player" | "monster";
  /** Stable id for updates (e.g. combatant id). */
  id?: string;
  /** Player-uploaded token image (data URL or https). */
  portraitUrl?: string;
  /** Built-in pixel token art when no portrait (class / monster sprite). */
  spriteUrl?: string;
  /** Fog + sight ring radius in grid cells (player PCs; from race/features). */
  sightRadiusCells?: number;
};

export type SceneLight = {
  gx: number;
  gy: number;
  radiusCells: number;
  intensity?: number;
  /** Room ambient vs wall torch vs creature — drives flicker strength in renderer. */
  kind?: "room" | "torch" | "token";
};

export type PlayerMapBroadcast = {
  dungeonData?: PlayerDungeonData;
  revealed?: number[];
  /** Precomputed visible cell keys for tools; optional if client recomputes from revealed. */
  revealedCells?: string[];
  doorOpen?: string[];
  fogColor?: string;
  selectedRoomId?: number | null;
  /**
   * When set, player map crops to this window (inclusive grid coords).
   * Lets the DM “zoom” the TV to the current fight.
   */
  viewCrop?: { minX: number; minY: number; maxX: number; maxY: number } | null;
  /** Battle / exploration pips (shown on both DM and player; fog hides non-visible cells). */
  battleTokens?: BattleToken[];
  /** Radial dimming: darkness outside torch discs; combined with max brightness. */
  sceneLights?: SceneLight[];
};

const STORAGE_KEY = "dnd5e-player-map-state";
const CHANNEL_NAME = "dnd5e-player-map";

export function broadcastPlayerMapState(state: PlayerMapBroadcast): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
  try {
    const bc = new BroadcastChannel(CHANNEL_NAME);
    bc.postMessage(state);
    bc.close();
  } catch {
    /* */
  }
}

export function readLastPlayerMapState(): PlayerMapBroadcast | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PlayerMapBroadcast;
  } catch {
    return null;
  }
}
