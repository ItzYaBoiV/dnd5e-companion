import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";
import { isDoorPassableInFog } from "@/lib/dungeonForgeDoorState";

export type RoomWithPlayerHidden = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  [k: string]: unknown;
};

/**
 * Merges DM "revealed room ids" with "unlock hidden side rooms when the linked door opens" rules.
 * Use before `computeVisibleCellsForPlayer` for the player TV and Play preview.
 */
export function applyPlayerHiddenRevealRules(
  base: Set<number> | Iterable<number>,
  rooms: RoomWithPlayerHidden[] | null | undefined,
  doorOpen: Set<string> | null | undefined,
  doorStates: Record<string, string> | null | undefined,
): Set<number> {
  const s = base instanceof Set ? new Set(base) : new Set(base);
  if (!rooms?.length) return s;
  for (const r of rooms) {
    if (!r.dmHideFromPlayer) continue;
    const dk = r.playerHiddenReleaseDoorKey;
    if (typeof dk === "string" && dk) {
      if (isDoorPassableInFog(dk, doorOpen, doorStates)) s.add(r.id);
      else s.delete(r.id);
    }
  }
  return s;
}

export function shouldVoidPlayerViewCell(
  x: number,
  y: number,
  rooms: RoomWithPlayerHidden[] | null | undefined,
  doorOpen: Set<string> | null | undefined,
  doorStates: Record<string, string> | null | undefined,
): boolean {
  if (!rooms?.length) return false;
  for (const r of rooms) {
    if (!r.dmHideFromPlayer) continue;
    const dk = r.playerHiddenReleaseDoorKey;
    if (typeof dk !== "string" || !dk) continue;
    if (isDoorPassableInFog(dk, doorOpen, doorStates)) continue;
    if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) continue;
    if (`${x},${y}` === dk) return false;
    return true;
  }
  return false;
}

function doorConnectsToCorridorOutside(
  grid: number[][],
  r: { x: number; y: number; w: number; h: number },
  W: number,
  H: number,
  x: number,
  y: number,
): boolean {
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (ny < 0 || nx < 0 || ny >= H || nx >= W) continue;
    if (nx < r.x || nx >= r.x + r.w || ny < r.y || ny >= r.y + r.h) {
      if (grid[ny][nx] === T.C) return true;
    }
  }
  return false;
}

/**
 * Rare small side room that is visible on the DM map but stays fogged for players until the door opens.
 */
export function tryMarkPlayerHiddenRoom(
  rooms: RoomWithPlayerHidden[],
  grid: number[][],
  W: number,
  H: number,
  rng: () => number,
  locationType: string,
): void {
  if (locationType !== "dungeon" && locationType !== "sewer" && locationType !== "castle") return;
  if (rng() > 0.14) return;
  const cands = rooms.filter((r) => r.id > 1 && r.w * r.h >= 4 && r.w * r.h <= 40);
  if (cands.length < 1) return;
  for (let t = 0; t < 7; t++) {
    const r = cands[Math.floor(rng() * cands.length)]!;
    const keys: string[] = [];
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x < 0 || y < 0 || y >= H || x >= W) continue;
        const t0 = grid[y][x];
        if (t0 !== T.D && t0 !== T.SECRET_DOOR) continue;
        if (!doorConnectsToCorridorOutside(grid, r, W, H, x, y)) continue;
        keys.push(`${x},${y}`);
      }
    }
    if (keys.length < 1) continue;
    r.dmHideFromPlayer = true;
    r.playerHiddenReleaseDoorKey = keys[Math.floor(rng() * keys.length)]!;
    return;
  }
}
