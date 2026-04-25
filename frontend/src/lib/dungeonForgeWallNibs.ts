import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";

const FLOORISH: ReadonlySet<number> = new Set([T.C, T.F, T.D, T.ROAD, T.BRIDGE, T.PIT, T.ALLEY]);

/**
 * Carve a few 1-tile "broken wall" tips: wall cells with exactly one floor-ish orthogonal neighbor, no void,
 * and no SECRET door on the cell — keeps connectivity and avoids new exterior holes to void.
 */
export function postprocessSafeWallNibs(
  grid: number[][],
  W: number,
  H: number,
  rng: () => number,
  options?: { probability?: number },
): void {
  const p = options?.probability ?? 0.32;
  if (W < 3 || H < 3) return;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (grid[y][x] !== T.W) continue;
      if (rng() > p) continue;
      if (grid[y - 1][x] === T.SECRET_DOOR || grid[y + 1][x] === T.SECRET_DOOR) continue;
      if (grid[y][x - 1] === T.SECRET_DOOR || grid[y][x + 1] === T.SECRET_DOOR) continue;
      let nFloor = 0;
      if (FLOORISH.has(grid[y - 1][x])) nFloor++;
      if (FLOORISH.has(grid[y + 1][x])) nFloor++;
      if (FLOORISH.has(grid[y][x - 1])) nFloor++;
      if (FLOORISH.has(grid[y][x + 1])) nFloor++;
      if (nFloor !== 1) continue;
      if (grid[y - 1][x] === T.V || grid[y + 1][x] === T.V) continue;
      if (grid[y][x - 1] === T.V || grid[y][x + 1] === T.V) continue;
      grid[y][x] = T.C;
    }
  }
}
