import { isDungeonGridWalkable } from "@/lib/dungeonForgeFog";

/** One orthogonal step toward a target for token marching (4-way movement). */
export function greedyStepToward(
  from: { gx: number; gy: number },
  to: { gx: number; gy: number },
  grid: number[][],
  occupied: Set<string>,
  selfKey: string,
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
    if (!isDungeonGridWalkable(tile)) continue;
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
): { gx: number; gy: number } {
  let x = Math.floor(from.gx);
  let y = Math.floor(from.gy);
  let selfKey = `${x},${y}`;
  for (let i = 0; i < maxSteps; i++) {
    if (x === to.gx && y === to.gy) break;
    const step = greedyStepToward({ gx: x, gy: y }, to, grid, occupied, selfKey);
    if (!step) break;
    occupied.delete(selfKey);
    selfKey = `${step.gx},${step.gy}`;
    occupied.add(selfKey);
    x = step.gx;
    y = step.gy;
  }
  return { gx: x, gy: y };
}
