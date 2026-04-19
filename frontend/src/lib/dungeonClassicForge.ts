import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";

export type DungeonRoomArchetype =
  | "entrance"
  | "corridor_junction"
  | "guard_post"
  | "storage"
  | "barracks"
  | "throne_room"
  | "shrine"
  | "secret_vault";

type ForgeRoom = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  type?: string;
  label?: string;
  roomType?: DungeonRoomArchetype;
  description?: string;
  depth?: number;
  depthNorm?: number;
};

export const DUNGEON_ROOM_DESCRIPTIONS: Record<DungeonRoomArchetype, string[]> = {
  entrance: [
    "The air smells of damp stone and old torch smoke.",
    "Crude markings warn trespassers — someone scratched them in Goblin.",
    "Cold drafts slip through gaps in the masonry; boot prints lead inward.",
  ],
  corridor_junction: [
    "A cramped nook where passages meet; dust swirls in your torchlight.",
    "Water drips somewhere in the dark; the floor is slick with slime.",
  ],
  guard_post: [
    "A stool and a splintered shield lean against the wall.",
    "Old oil lamps hang cold; someone was posted here recently.",
  ],
  storage: [
    "Broken crates and spilled grain litter the corners.",
    "Shelves lean precariously, half-empty jars rattling when you move.",
  ],
  barracks: [
    "Crude sleeping mats line the walls. A fire pit smolders in the corner.",
    "Weapon racks hold rusty spears and shortbows; the smell of sweat lingers.",
  ],
  throne_room: [
    "A massive throne of bone and iron dominates the far wall. The floor is sticky with old blood.",
    "Banners hang in tatters; a circle of scorched stone suggests old rituals.",
  ],
  shrine: [
    "A stone idol stares from the far wall. Something glitters at its feet.",
    "Incense burns on a cracked altar; offerings long rotted away.",
  ],
  secret_vault: [
    "This chamber feels forgotten — air stale, silence absolute.",
    "Dust lies thick; no footprints but yours mark the floor.",
  ],
};

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/** Room whose west wall is closest to x=0 (dungeon entrance bias). */
export function getDungeonWestEntranceRoom(rooms: ForgeRoom[]): ForgeRoom | null {
  if (!rooms.length) return null;
  return rooms.reduce((a, b) => (a.x <= b.x ? a : b));
}

function roomArea(r: ForgeRoom): number {
  return r.w * r.h;
}

function manhattanDepth(entrance: ForgeRoom, r: ForgeRoom): number {
  return Math.abs(r.cx - entrance.cx) + Math.abs(r.cy - entrance.cy);
}

/**
 * Assigns `roomType`, `description`, `depthNorm` for classic rectangular dungeon layouts.
 */
export function assignDungeonRoomArchetypes(
  rooms: ForgeRoom[],
  grid: number[][],
  entrance: ForgeRoom,
  rng: () => number,
): ForgeRoom {
  if (!rooms.length) return entrance;
  const maxD = Math.max(1, ...rooms.map((r) => manhattanDepth(entrance, r)));
  let largest = rooms[0]!;
  let maxA = 0;
  for (const r of rooms) {
    const a = roomArea(r);
    if (a > maxA) {
      maxA = a;
      largest = r;
    }
  }

  const small = new Set<ForgeRoom>();
  const medium = new Set<ForgeRoom>();
  for (const r of rooms) {
    const a = roomArea(r);
    if (a < 24) small.add(r);
    else if (a < 80) medium.add(r);
  }

  const largestId = largest.id;
  const vaultPool = [...small].filter((r) => r.id !== entrance.id && r.id !== largestId);
  const vault = vaultPool.length ? pick(vaultPool, rng) : null;

  for (const r of rooms) {
    const depthN = Math.min(1, manhattanDepth(entrance, r) / maxD);
    r.depthNorm = depthN;
    let arch: DungeonRoomArchetype;
    if (r.id === entrance.id) arch = "entrance";
    else if (r.id === largestId) arch = "throne_room";
    else if (vault && r.id === vault.id) arch = "secret_vault";
    else if (small.has(r)) arch = "corridor_junction";
    else if (depthN < 0.35 && medium.has(r)) arch = "guard_post";
    else if (medium.has(r) && rng() < 0.45) arch = "storage";
    else if (roomArea(r) >= 48 && r.id !== largestId) arch = "barracks";
    else if (rng() < 0.22) arch = "shrine";
    else arch = medium.has(r) ? "storage" : "guard_post";

    r.roomType = arch;
    r.description = pick(DUNGEON_ROOM_DESCRIPTIONS[arch], rng);
  }

  if (vault) {
    try {
      placeSecretVaultHiddenDoor(grid, vault, rooms, rng);
    } catch {
      /* noop */
    }
  }

  return largest;
}

/** Replace one interior wall cell with a secret door tile facing a corridor. */
function placeSecretVaultHiddenDoor(
  grid: number[][],
  vault: ForgeRoom,
  rooms: ForgeRoom[],
  rng: () => number,
): void {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const candidates: { x: number; y: number }[] = [];
  for (let y = vault.y; y < vault.y + vault.h; y++) {
    for (let x = vault.x; x < vault.x + vault.w; x++) {
      if (grid[y]?.[x] !== T.W) continue;
      for (const [dx, dy] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const t = grid[ny][nx];
        if (t === T.C || t === T.F) {
          const otherRoom = rooms.find(
            (rm) => rm !== vault && nx >= rm.x && nx < rm.x + rm.w && ny >= rm.y && ny < rm.y + rm.h,
          );
          if (otherRoom || t === T.C) {
            candidates.push({ x, y });
            break;
          }
        }
      }
    }
  }
  if (!candidates.length) return;
  const c = pick(candidates, rng);
  grid[c.y][c.x] = T.SECRET_DOOR;
}

/** Interior 2×2 pillar clusters in rooms wider and taller than 6. */
export function placeDungeonInteriorPillars(grid: number[][], rooms: ForgeRoom[]): void {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  for (const r of rooms) {
    if (r.w <= 6 && r.h <= 6) continue;
    const ix = r.x + Math.floor(r.w / 2) - 1;
    const iy = r.y + Math.floor(r.h / 2) - 1;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const x = ix + dx;
        const y = iy + dy;
        if (x < r.x + 1 || x >= r.x + r.w - 1 || y < r.y + 1 || y >= r.y + r.h - 1) continue;
        if (y < 0 || y >= H || x < 0 || x >= W) continue;
        if (grid[y][x] === T.F) grid[y][x] = T.P;
      }
    }
  }
}

/**
 * Places 1–2 secret doors on walls between rooms whose centers are far apart (extra shortcuts).
 */
export function placeExtraSecretDoors(
  grid: number[][],
  rooms: ForgeRoom[],
  rng: () => number,
  W: number,
  H: number,
  count: number,
): void {
  const pairs: [ForgeRoom, ForgeRoom][] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i]!;
      const b = rooms[j]!;
      const d = Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
      if (d > Math.max(a.w, b.w) + Math.max(a.h, b.h)) pairs.push([a, b]);
    }
  }
  let placed = 0;
  while (placed < count && pairs.length) {
    const idx = Math.floor(rng() * pairs.length);
    const [a, b] = pairs.splice(idx, 1)[0]!;
    const mx = Math.floor((a.cx + b.cx) / 2);
    const my = Math.floor((a.cy + b.cy) / 2);
    if (tryPlaceSecretDoorNear(grid, mx, my, W, H)) placed++;
  }
}

function tryPlaceSecretDoorNear(grid: number[][], cx: number, cy: number, W: number, H: number): boolean {
  for (let r = 0; r < 6; r++) {
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [2, 0],
      [-2, 0],
    ] as const) {
      const x = cx + dx + (r % 2);
      const y = cy + dy + (r % 3);
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      if (grid[y][x] !== T.W) continue;
      let floorN = 0;
      for (const [fx, fy] of [
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ] as const) {
        const t = grid[y + fy]?.[x + fx];
        if (t === T.F || t === T.C) floorN++;
      }
      if (floorN >= 1) {
        grid[y][x] = T.SECRET_DOOR;
        return true;
      }
    }
  }
  return false;
}

export type CorridorLinkLabel = { x: number; y: number; text: string };

/** Approximate distance labels between room pairs (straight-line via centers). */
export function buildCorridorDistanceLabels(rooms: ForgeRoom[], entrance: ForgeRoom): CorridorLinkLabel[] {
  if (rooms.length < 2) return [];
  const labels: CorridorLinkLabel[] = [];
  const ordered = [...rooms].sort((a, b) => {
    const da = manhattanDepth(entrance, a);
    const db = manhattanDepth(entrance, b);
    return da - db;
  });
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = ordered[i]!;
    const b = ordered[i + 1]!;
    const tiles = Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy);
    const ft = Math.max(5, Math.round(tiles * 5 * 1.15));
    const x = Math.floor((a.cx + b.cx) / 2);
    const y = Math.floor((a.cy + b.cy) / 2);
    labels.push({ x, y, text: `${ft} ft` });
  }
  return labels.slice(0, 12);
}

export function addEntranceEnterDeco(
  decoOverlay: Array<Record<string, unknown>>,
  entrance: ForgeRoom,
  grid: number[][],
  W: number,
  _H: number,
): void {
  let bx = entrance.x;
  let by = entrance.cy;
  for (let x = entrance.x; x < entrance.x + entrance.w && x < W; x++) {
    if (grid[entrance.y]?.[x] === T.D || grid[entrance.y - 1]?.[x] === T.C) {
      bx = x;
      by = entrance.y;
      break;
    }
  }
  decoOverlay.push({
    x: Math.min(W - 2, bx + 1),
    y: Math.max(1, by - 1),
    ch: "→",
    fg: "#c9a020",
    name: "Enter Here",
    roomId: entrance.id,
    decoKey: "entrance_arrow",
  });
}
