import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";
import type { BattleToken } from "@/lib/playerMapBroadcast";

export type FogDungeonGrid = {
  grid: number[][];
  rooms: Array<{ id: number; x: number; y: number; w: number; h: number; cx?: number; cy?: number }>;
  width: number;
  height: number;
};

/**
 * Flood visibility from revealed room interiors through corridors/doors/roads (and optionally connective T.F yards).
 * Closed doors (not passable per `doorOpen` / `doorStates`) block passage; the door tile itself remains visible from the side that already has line-of-sight.
 */
function doorPassableAt(
  key: string,
  doorOpen: Set<string> | null | undefined,
  doorStates: Record<string, string> | null | undefined,
): boolean {
  if (doorStates && Object.prototype.hasOwnProperty.call(doorStates, key)) {
    return doorStates[key] === "open";
  }
  if (doorOpen == null) return true;
  return doorOpen.has(key);
}

export type ComputeVisibleFogOpts = {
  openFloor?: boolean;
  /**
   * Max BFS steps from revealed-room tiles through corridors / roads / bridges / lava.
   * Without a cap, a single revealed room can expose every corridor tile on the map (e.g. castle),
   * and adjacent walls outline the entire structure. Omit or `undefined` for unlimited (yards / towns).
   */
  maxFogHops?: number;
};

/** Default hop limit for dungeon-like interiors (castle, sewer, cave, …). */
export const DEFAULT_INTERIOR_MAX_FOG_HOPS = 28;

/** Yards and outdoor grids where revealed rooms should flood through connective T.F (not only corridors). */
export function isOpenFloorLocation(locationType: string): boolean {
  return (
    locationType === "graveyard" ||
    locationType === "swamp" ||
    locationType === "town" ||
    locationType === "road"
  );
}

export function maxFogHopsForLocationType(locationType: string | undefined): number | undefined {
  if (isOpenFloorLocation(locationType ?? "")) return undefined;
  return DEFAULT_INTERIOR_MAX_FOG_HOPS;
}

/** Room id whose bounding box contains (x,y), or null if in shared yard / void. */
export function cellRoomId(dg: FogDungeonGrid, x: number, y: number): number | null {
  for (const r of dg.rooms) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r.id;
  }
  return null;
}

export function computeVisibleCellsForPlayer(
  revealed: Set<number> | Iterable<number>,
  dg: FogDungeonGrid,
  doorOpen: Set<string> | null | undefined,
  doorStates?: Record<string, string> | null,
  fogOpts?: ComputeVisibleFogOpts,
): Set<string> {
  const rev = revealed instanceof Set ? revealed : new Set(revealed);
  const cells = new Set<string>();
  const W = dg.width;
  const H = dg.height;
  const g = dg.grid;
  if (!g?.length) return cells;

  const openFloor = !!fogOpts?.openFloor;
  const maxFogHops = fogOpts?.maxFogHops;

  const seeds: string[] = [];
  for (const rm of dg.rooms) {
    if (!rev.has(rm.id)) continue;
    for (let y = rm.y; y < rm.y + rm.h; y++) {
      for (let x = rm.x; x < rm.x + rm.w; x++) {
        if (y < 0 || x < 0 || y >= H || x >= W) continue;
        const k = `${x},${y}`;
        cells.add(k);
        seeds.push(k);
      }
    }
  }

  const visited = new Set<string>();
  const queue: { key: string; d: number }[] = [];
  for (const k of seeds) {
    visited.add(k);
    queue.push({ key: k, d: 0 });
  }

  function doorKeyForStep(x: number, y: number, nx: number, ny: number): string | null {
    const t1 = g[y]?.[x];
    const t2 = g[ny]?.[nx];
    if (t1 === T.D) return `${x},${y}`;
    if (t2 === T.D) return `${nx},${ny}`;
    return null;
  }

  while (queue.length) {
    const { key, d } = queue.shift()!;
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = `${nx},${ny}`;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;

      const dk = doorKeyForStep(x, y, nx, ny);
      if (dk && !doorPassableAt(dk, doorOpen, doorStates ?? null)) {
        const nt = g[ny][nx];
        if (nt === T.D && (maxFogHops == null || d <= maxFogHops)) {
          cells.add(nk);
          if (!visited.has(nk)) visited.add(nk);
        }
        continue;
      }

      if (visited.has(nk)) continue;

      const tile = g[ny][nx];
      const nd = d + 1;
      if (maxFogHops != null && nd > maxFogHops) {
        if (tile === T.W && d <= maxFogHops) cells.add(nk);
        continue;
      }

      if (tile === T.C || tile === T.D || tile === T.ROAD || tile === T.BRIDGE || tile === T.LAVA) {
        visited.add(nk);
        cells.add(nk);
        queue.push({ key: nk, d: nd });
      } else if (openFloor && tile === T.F) {
        const interiorRid = cellRoomId(dg, nx, ny);
        if (interiorRid != null && !rev.has(interiorRid)) {
          continue;
        }
        visited.add(nk);
        cells.add(nk);
        queue.push({ key: nk, d: nd });
      } else if (tile === T.W) {
        cells.add(nk);
      }
    }
  }

  return cells;
}

/** Floors / corridors / doors / roads the party can stand on for token placement and marching. */
export function isDungeonGridWalkable(tile: number): boolean {
  return (
    tile === T.F ||
    tile === T.C ||
    tile === T.D ||
    tile === T.ROAD ||
    tile === T.BRIDGE ||
    tile === T.SD ||
    tile === T.SU
  );
}

function isDungeonTileVisionTransparent(tile: number): boolean {
  return tile !== T.V && tile !== T.W;
}

/**
 * Adds fog cells in a Chebyshev-radius disc around each **player** token so revealed area moves with the party
 * (cheap compared to per-token volumetric lights). Uses `sightRadiusCells` per token when set.
 */
export function expandFogWithPlayerTokenVision(
  cells: Set<string>,
  grid: number[][],
  tokens: (Pick<BattleToken, "gx" | "gy" | "kind"> & { sightRadiusCells?: number })[] | null | undefined,
  defaultRadiusCells: number,
): void {
  if (!tokens?.length) return;
  const H = grid.length;
  const W = H > 0 ? grid[0]?.length ?? 0 : 0;
  if (W < 1 || H < 1) return;
  for (const t of tokens) {
    if (t.kind !== "player") continue;
    const R = Math.max(1, Math.floor(t.sightRadiusCells ?? defaultRadiusCells));
    const tx = Math.floor(t.gx);
    const ty = Math.floor(t.gy);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) > R) continue;
        const x = tx + dx;
        const y = ty + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const tile = grid[y]![x]!;
        if (!isDungeonTileVisionTransparent(tile)) continue;
        cells.add(`${x},${y}`);
      }
    }
  }
}

/**
 * Pick a plausible entry room: perimeter/void-adjacent door, stairs up, map edge touch, then favor south (common outdoor gate).
 */
export function inferStartingRoomId(dg: FogDungeonGrid): number | null {
  const { rooms, grid, width: W, height: H } = dg;
  if (!rooms.length) return null;

  function roomTouchesMapEdge(r: (typeof rooms)[0]): boolean {
    if (r.x <= 1 || r.y <= 1 || r.x + r.w >= W - 2 || r.y + r.h >= H - 2) return true;
    return false;
  }

  function roomHasTile(r: (typeof rooms)[0], tile: number): boolean {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (grid[y]?.[x] === tile) return true;
      }
    }
    return false;
  }

  function perimeterDoorPenalty(r: (typeof rooms)[0]): number {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (grid[y]?.[x] !== T.D) continue;
        for (const [dx, dy] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) return 0;
          if (grid[ny]?.[nx] === T.V) return 0;
        }
      }
    }
    return 55;
  }

  const scored = rooms.map((rm) => {
    const cy = rm.cy ?? Math.floor(rm.y + rm.h / 2);
    const southBias = -cy * 0.02;
    const edge = roomTouchesMapEdge(rm) ? -8 : 0;
    const su = roomHasTile(rm, T.SU) ? -18 : 0;
    const sd = roomHasTile(rm, T.SD) ? -6 : 0;
    const pd = perimeterDoorPenalty(rm);
    const score = pd + su + sd + edge + southBias;
    return { id: rm.id, score };
  });
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.id ?? rooms[0].id;
}
