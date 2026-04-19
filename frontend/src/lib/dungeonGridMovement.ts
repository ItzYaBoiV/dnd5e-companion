import { isDungeonGridWalkable } from "@/lib/dungeonForgeFog";

/** Shortest walkable path (4-neighbor BFS). Returns [start … end] inclusive, or null. */
export function shortestWalkablePathBfs(
  grid: number[][],
  start: { gx: number; gy: number },
  end: { gx: number; gy: number },
  locationType?: string,
): { gx: number; gy: number }[] | null {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const sx = Math.floor(start.gx);
  const sy = Math.floor(start.gy);
  const ex = Math.floor(end.gx);
  const ey = Math.floor(end.gy);
  if (W < 1 || H < 1) return null;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H || ex < 0 || ey < 0 || ex >= W || ey >= H) return null;
  const sTile = grid[sy]![sx]!;
  const eTile = grid[ey]![ex]!;
  if (!isDungeonGridWalkable(sTile, locationType) || !isDungeonGridWalkable(eTile, locationType))
    return null;
  if (sx === ex && sy === ey) return [{ gx: sx, gy: sy }];

  const startKey = `${sx},${sy}`;
  const queue: [number, number][] = [[sx, sy]];
  const seen = new Set<string>([startKey]);
  const parent = new Map<string, string | null>();
  parent.set(startKey, null);

  const orth = (x: number, y: number): [number, number][] => [
    [x + 1, y],
    [x - 1, y],
    [x, y + 1],
    [x, y - 1],
  ];

  while (queue.length) {
    const [x, y] = queue.shift()!;
    if (x === ex && y === ey) {
      const path: { gx: number; gy: number }[] = [];
      let ck: string | null = `${x},${y}`;
      while (ck) {
        const [px, py] = ck.split(",").map(Number) as [number, number];
        path.push({ gx: px, gy: py });
        ck = parent.get(ck) ?? null;
      }
      path.reverse();
      return path;
    }
    for (const [nx, ny] of orth(x, y)) {
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (!isDungeonGridWalkable(grid[ny]![nx]!, locationType)) continue;
      const nk = `${nx},${ny}`;
      if (seen.has(nk)) continue;
      seen.add(nk);
      parent.set(nk, `${x},${y}`);
      queue.push([nx, ny]);
    }
  }
  return null;
}

/** One orthogonal step toward a target for token marching (4-way movement). */
export function greedyStepToward(
  from: { gx: number; gy: number },
  to: { gx: number; gy: number },
  grid: number[][],
  occupied: Set<string>,
  selfKey: string,
  locationType?: string,
): { gx: number; gy: number } | null {
  const fx = Math.floor(from.gx);
  const fy = Math.floor(from.gy);
  if (fx === to.gx && fy === to.gy) return null;
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  if (W < 1 || H < 1) return null;
  const ortho: [number, number][] = [
    [fx + 1, fy],
    [fx - 1, fy],
    [fx, fy + 1],
    [fx, fy - 1],
  ];
  type Cand = { nx: number; ny: number; dist: number };
  const cands: Cand[] = [];
  for (const [nx, ny] of ortho) {
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const tile = grid[ny]![nx]!;
    if (!isDungeonGridWalkable(tile, locationType)) continue;
    const nk = `${nx},${ny}`;
    if (occupied.has(nk) && nk !== selfKey) continue;
    const dist = Math.abs(to.gx - nx) + Math.abs(to.gy - ny);
    cands.push({ nx, ny, dist });
  }
  if (cands.length === 0) return null;
  cands.sort((a, b) => a.dist - b.dist || a.nx - b.nx || a.ny - b.ny);
  const best = cands[0]!;
  return { gx: best.nx, gy: best.ny };
}

/**
 * Repeated greedy steps along walkable cells (updates `occupied` like marching).
 * Stops at target, no progress, or max steps.
 */
export function walkGreedyStepsOnGrid(
  grid: number[][],
  from: { gx: number; gy: number },
  to: { gx: number; gy: number },
  occupied: Set<string>,
  maxSteps: number,
  locationType?: string,
): { gx: number; gy: number } {
  let x = Math.floor(from.gx);
  let y = Math.floor(from.gy);
  let selfKey = `${x},${y}`;
  for (let i = 0; i < maxSteps; i++) {
    if (x === to.gx && y === to.gy) break;
    const step = greedyStepToward({ gx: x, gy: y }, to, grid, occupied, selfKey, locationType);
    if (!step) break;
    occupied.delete(selfKey);
    selfKey = `${step.gx},${step.gy}`;
    occupied.add(selfKey);
    x = step.gx;
    y = step.gy;
  }
  return { gx: x, gy: y };
}
