import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";

/** Deterministic RNG for stable torch placement per room. */
export function makeSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffff_ffff;
  };
}

/**
 * Floor cells inside a room that touch a wall / door / void — good for sconce-style lights
 * (instead of the room centroid).
 */
export function pickWallAdjacentFloorCells(
  grid: number[][],
  room: { x: number; y: number; w: number; h: number },
  max: number,
  rng: () => number,
): { gx: number; gy: number }[] {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const wallish = (t: number | undefined) =>
    t === T.W || t === T.D || t === T.V || t === undefined;

  const candidates: { gx: number; gy: number }[] = [];
  for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
    for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
      if (y < 1 || y >= H - 1 || x < 1 || x >= W - 1) continue;
      if (grid[y]?.[x] !== T.F) continue;
      const nbrs = [grid[y - 1]?.[x], grid[y + 1]?.[x], grid[y]?.[x - 1], grid[y]?.[x + 1]];
      if (nbrs.some(wallish)) candidates.push({ gx: x, gy: y });
    }
  }

  const out: { gx: number; gy: number }[] = [];
  const pool = [...candidates];
  const n = Math.min(max, pool.length);
  for (let i = 0; i < n; i++) {
    const j = Math.floor(rng() * pool.length);
    out.push(pool.splice(j, 1)[0]!);
  }
  return out;
}
