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
  const dx = Math.sign(to.gx - fx);
  const dy = Math.sign(to.gy - fy);
  const preferX = Math.abs(to.gx - fx) >= Math.abs(to.gy - fy);
  const tryOrder = preferX
    ? [
        [fx + dx, fy],
        [fx, fy + dy],
      ]
    : [
        [fx, fy + dy],
        [fx + dx, fy],
      ];
  for (const [nx, ny] of tryOrder) {
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    const tile = grid[ny]![nx]!;
    if (!isDungeonGridWalkable(tile)) continue;
    const nk = `${nx},${ny}`;
    if (occupied.has(nk) && nk !== selfKey) continue;
    return { gx: nx, gy: ny };
  }
  return null;
}
