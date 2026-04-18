import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";

export type FogDungeonGrid = {
  grid: number[][];
  rooms: Array<{ id: number; x: number; y: number; w: number; h: number; cx?: number; cy?: number }>;
  width: number;
  height: number;
};

/**
 * Flood visibility from revealed room interiors through corridors/doors/roads only.
 * Closed doors (not in `doorOpen`) block passage; the door tile itself remains visible from the side that already has line-of-sight.
 */
export function computeVisibleCellsForPlayer(
  revealed: Set<number> | Iterable<number>,
  dg: FogDungeonGrid,
  doorOpen: Set<string> | null | undefined,
): Set<string> {
  const doorKeys = doorOpen ?? new Set<string>();
  const rev = revealed instanceof Set ? revealed : new Set(revealed);
  const cells = new Set<string>();
  const W = dg.width;
  const H = dg.height;
  const g = dg.grid;
  if (!g?.length) return cells;

  for (const rm of dg.rooms) {
    if (!rev.has(rm.id)) continue;
    for (let y = rm.y; y < rm.y + rm.h; y++) {
      for (let x = rm.x; x < rm.x + rm.w; x++) {
        if (y < 0 || x < 0 || y >= H || x >= W) continue;
        cells.add(`${x},${y}`);
      }
    }
  }

  const queue = [...cells];
  const visited = new Set(cells);

  function doorKeyForStep(x: number, y: number, nx: number, ny: number): string | null {
    const t1 = g[y]?.[x];
    const t2 = g[ny]?.[nx];
    if (t1 === T.D) return `${x},${y}`;
    if (t2 === T.D) return `${nx},${ny}`;
    return null;
  }

  while (queue.length) {
    const key = queue.shift()!;
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
      if (visited.has(nk)) continue;

      const dk = doorKeyForStep(x, y, nx, ny);
      if (dk && !doorKeys.has(dk)) {
        const nt = g[ny][nx];
        if (nt === T.D) {
          cells.add(nk);
          visited.add(nk);
        }
        continue;
      }

      const tile = g[ny][nx];
      if (tile === T.C || tile === T.D || tile === T.ROAD) {
        visited.add(nk);
        cells.add(nk);
        queue.push(nk);
      } else if (tile === T.W) {
        cells.add(nk);
      }
    }
  }

  return cells;
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
