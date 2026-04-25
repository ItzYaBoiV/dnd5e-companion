/**
 * Shared DM TV / player page logic: crop window, fog, and sub-grid for rendering
 * (2D canvas, isometric, or Three.js 3D).
 */
import { buildRenderGrid, effectiveDungeonGridDims } from "@/lib/dungeonForgeRenderGrid";
import { applyPlayerHiddenRevealRules } from "@/lib/dungeonForgePlayerHidden";
import {
  computeVisibleCellsForPlayer,
  expandFogWithPlayerTokenVision,
  isOpenFloorLocation,
  maxFogHopsForLocationType,
} from "@/lib/dungeonForgeFog";
import { DEFAULT_PLAYER_VISION_FOG_CELLS } from "@/lib/playerMapVision";
import type { PlayerMapBroadcast, SceneLight } from "@/lib/playerMapBroadcast";
import { forgePaletteForDungeon } from "@/lib/dungeonTilePalettes";
import type { RenderCell, TilePalette } from "@/lib/dungeonTileRenderer";

function gridDims(dg: NonNullable<PlayerMapBroadcast["dungeonData"]>): { gw: number; gh: number } {
  const grid = dg.grid;
  if (!Array.isArray(grid) || grid.length === 0) {
    return {
      gw: Math.max(1, Number(dg.width) || 1),
      gh: Math.max(1, Number(dg.height) || 1),
    };
  }
  const gh = grid.length;
  const gw = grid.reduce((m, row) => Math.max(m, Array.isArray(row) ? row.length : 0), 0);
  return {
    gw: Math.max(gw, Number(dg.width) || 0, 1),
    gh: Math.max(gh, Number(dg.height) || 0, 1),
  };
}

/** Bounding box of cell keys, clamped to grid; empty if no valid keys. */
function cellKeysBBox(
  keys: Iterable<string>,
  gw: number,
  gh: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const k of keys) {
    const parts = k.split(",");
    if (parts.length !== 2) continue;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    if (fx < 0 || fy < 0 || fx >= gw || fy >= gh) continue;
    minX = Math.min(minX, fx);
    minY = Math.min(minY, fy);
    maxX = Math.max(maxX, fx);
    maxY = Math.max(maxY, fy);
  }
  if (minX === Infinity) return null;
  return { minX, minY, maxX, maxY };
}

export type PlayerTvMapFrame = {
  viewWindow: { minX: number; minY: number; maxX: number; maxY: number; bw: number; bh: number };
  sub: RenderCell[][];
  fogAdj: Set<string>;
  doorOpen: Set<string> | null;
  sceneLights: SceneLight[];
  palette: TilePalette;
  viewMode: PlayerMapBroadcast["viewMode"];
  dungeonLighting?: "lit" | "dim" | "dark";
  mapOutdoorTime?: "day" | "dusk" | "night";
};

export function buildPlayerTvMapFrame(mapState: PlayerMapBroadcast | null): PlayerTvMapFrame | null {
  const raw = mapState?.dungeonData;
  if (!raw?.grid || !raw.rooms?.length) return null;

  const dims = effectiveDungeonGridDims(raw);
  const dg = {
    ...raw,
    entities: raw.entities ?? [],
    decoOverlay: raw.decoOverlay ?? [],
    width: dims.w,
    height: dims.h,
  };

  const { gw, gh } = gridDims(dg);
  if (gw < 1 || gh < 1) return null;

  const doorOpen =
    mapState?.doorOpen === undefined || mapState.doorOpen === null ? null : new Set(mapState.doorOpen);
  const doorStates = mapState?.doorStates ?? null;
  const revealed = applyPlayerHiddenRevealRules(
    new Set(mapState?.revealed ?? []),
    dg.rooms,
    doorOpen,
    doorStates,
  );
  const locType = dg.locationType ?? "dungeon";
  const manualSeeds =
    mapState?.dmManualRevealCells?.length && Array.isArray(mapState.dmManualRevealCells)
      ? mapState.dmManualRevealCells
      : null;
  const fogCells = computeVisibleCellsForPlayer(revealed, dg, doorOpen, doorStates, {
    openFloor: isOpenFloorLocation(locType),
    maxFogHops: maxFogHopsForLocationType(locType),
    locationType: locType,
  }, manualSeeds);
  expandFogWithPlayerTokenVision(
    fogCells,
    dg.grid as number[][],
    mapState?.battleTokens ?? [],
    DEFAULT_PLAYER_VISION_FOG_CELLS,
    locType,
  );

  const palette = forgePaletteForDungeon(dg);
  const rg = buildRenderGrid(dg, { showThemes: false, playerView: true, doorOpen, doorStates });

  const vc = mapState?.viewCrop;
  let minX = 0;
  let minY = 0;
  let maxX = gw - 1;
  let maxY = gh - 1;
  const pad = 2;
  /**
   * Extra margin beyond fog bbox so wall/corner tiles still have neighbor `RenderCell`s in `sub`.
   * Cropping tight to visible fog made `drawBaseTile` read undefined/off-grid neighbors → missing corners
   * in hallways and rooms on the TV crop.
   */
  const RENDER_PAD = 2;

  if (
    vc &&
    Number.isFinite(vc.minX) &&
    Number.isFinite(vc.minY) &&
    Number.isFinite(vc.maxX) &&
    Number.isFinite(vc.maxY) &&
    vc.maxX >= vc.minX &&
    vc.maxY >= vc.minY
  ) {
    minX = Math.max(0, Math.floor(vc.minX));
    minY = Math.max(0, Math.floor(vc.minY));
    maxX = Math.min(gw - 1, Math.floor(vc.maxX));
    maxY = Math.min(gh - 1, Math.floor(vc.maxY));
  } else {
    const bbox = cellKeysBBox(fogCells, gw, gh);
    const useFull = bbox === null || fogCells.size === 0;
    if (bbox && !useFull) {
      minX = Math.max(0, bbox.minX - pad);
      minY = Math.max(0, bbox.minY - pad);
      maxX = Math.min(gw - 1, bbox.maxX + pad);
      maxY = Math.min(gh - 1, bbox.maxY + pad);
    }
  }

  minX = Math.max(0, minX - RENDER_PAD);
  minY = Math.max(0, minY - RENDER_PAD);
  maxX = Math.min(gw - 1, maxX + RENDER_PAD);
  maxY = Math.min(gh - 1, maxY + RENDER_PAD);

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;

  const sub: typeof rg = [];
  for (let y = minY; y <= maxY; y++) {
    const row = [];
    for (let x = minX; x <= maxX; x++) {
      row.push(rg[y]![x]!);
    }
    sub.push(row);
  }

  const fogAdj = new Set<string>();
  for (const k of fogCells) {
    const parts = k.split(",");
    if (parts.length !== 2) continue;
    const gx = Number(parts[0]);
    const gy = Number(parts[1]);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
    fogAdj.add(`${gx - minX},${gy - minY}`);
  }

  const sceneLights = (mapState?.sceneLights ?? [])
    .filter((L) => L.kind !== "token")
    .map((L) => ({
      ...L,
      gx: L.gx - minX,
      gy: L.gy - minY,
    }));

  const loc = dg.locationType ?? "dungeon";
  const drec = dg as Record<string, unknown>;
  let dungeonLighting: "lit" | "dim" | "dark" | undefined;
  if (loc === "dungeon") {
    const dl = drec.dungeonLighting;
    dungeonLighting =
      dl === "dim" || dl === "dark" || dl === "lit" ? dl : "lit";
  }
  let mapOutdoorTime: "day" | "dusk" | "night" | undefined;
  if (loc === "town" || loc === "road") {
    const fo = drec.forgeOutdoorTime;
    mapOutdoorTime =
      fo === "day" || fo === "dusk" || fo === "night" ? fo : "dusk";
  }

  return {
    viewWindow: { minX, minY, maxX, maxY, bw, bh },
    sub,
    fogAdj,
    doorOpen,
    sceneLights,
    palette,
    viewMode: mapState?.viewMode === "flat" ? "depth" : (mapState?.viewMode ?? "depth"),
    dungeonLighting,
    mapOutdoorTime,
  };
}
