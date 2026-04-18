/**
 * Deterministic grid dungeon layouts for the canvas map (no LLM).
 * Rooms grow on a grid with optional non-rectangular footprints (see `shapeMask`) for overlap checks.
 */

import {
  masksOverlap,
  pickShapeForBucket,
  shapeMask,
  type RoomShape,
} from "./proceduralDungeonShapes";

export type ProceduralRoomType = "entrance" | "corridor" | "chamber" | "boss" | "treasure" | "trap";

export type ForgeThemeTag =
  | "entrance"
  | "guard"
  | "treasure"
  | "trap"
  | "rest"
  | "boss"
  | "lore"
  | "puzzle";

/** Stored on DungeonRoom.features — DM-only structured data; player view uses safe subsets only. */
export type RoomDmFeatures = {
  layoutMeta?: {
    shape?: RoomShape;
    depth?: number;
    themeTag?: ForgeThemeTag | string;
    namedRoom?: string | null;
  };
  secretDoors?: {
    wall: string;
    trigger: string;
    perceptionDc?: number;
    investigationDc?: number;
    destination?: string;
  }[];
  hiddenStashes?: { label: string; investigationDc?: number; contents: string }[];
  pointsOfInterest?: { label: string; playerClue: string; dmDetail: string }[];
};

export interface ProceduralRoomDraft {
  id: string;
  name: string;
  /** Safer label for players (map + room list); empty means use `name`. */
  playerLabel: string;
  type: ProceduralRoomType;
  x: number;
  y: number;
  width: number;
  height: number;
  exits: { north: string | null; south: string | null; east: string | null; west: string | null };
  playerDescription: string;
  description: string;
  dmSecrets: string;
  monsters: { monsterSlug: string; count: number; notes: string }[];
  treasures: { gold: number; items: string[] };
  traps: { name: string; description: string; dc: number; damage: string } | null;
  features: RoomDmFeatures | null;
  notes: string;
}

type Rect = { id: string; x: number; y: number; w: number; h: number };
type Placed = Rect & { shape: RoomShape; mask: boolean[][] };

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromTheme(theme: string, roomCount: number, difficulty: string): number {
  const s = `${theme}|${roomCount}|${difficulty}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/**
 * If the user supplies a seed, it fully determines the layout (reproducible).
 * If omitted, derives a seed from theme + size + difficulty (stable per combo).
 */
export function resolveMapSeed(
  explicit: number | string | null | undefined,
  theme: string,
  roomCount: number,
  difficulty: string,
): number {
  if (explicit !== undefined && explicit !== null && String(explicit).trim() !== "") {
    const raw = typeof explicit === "number" ? explicit : String(explicit).trim();
    const n = typeof raw === "number" ? raw : parseInt(raw.replace(/_/g, ""), 10);
    if (Number.isFinite(n)) {
      return Math.trunc(n) >>> 0;
    }
  }
  return seedFromTheme(theme, roomCount, difficulty);
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return Math.max(a0, b0) < Math.min(a1, b1);
}

function overlaps(a: Rect, b: Rect): boolean {
  return !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
}

function inferLocationBucket(theme: string): "castle" | "dungeon" | "cave" | "sewer" {
  const t = theme.toLowerCase();
  if (/castle|keep|palace|manor|fort\b/.test(t)) return "castle";
  if (/cave|cavern|grotto|underdark/.test(t)) return "cave";
  if (/sewer|undercity|pipe|flood|drain/.test(t)) return "sewer";
  return "dungeon";
}

function bfsDepths(
  exitMap: Map<string, { north: string | null; south: string | null; east: string | null; west: string | null }>,
  startId = "room_0",
): Map<string, number> {
  const depth = new Map<string, number>();
  const q: string[] = [startId];
  depth.set(startId, 0);
  while (q.length) {
    const id = q.shift()!;
    const d = depth.get(id)!;
    const ex = exitMap.get(id);
    if (!ex) continue;
    for (const n of [ex.north, ex.south, ex.east, ex.west] as const) {
      if (!n || depth.has(n)) continue;
      depth.set(n, d + 1);
      q.push(n);
    }
  }
  return depth;
}

function tryPlaceNorth(parent: Rect, nw: number, nh: number, rnd: () => number): Rect | null {
  const minNx = parent.x - nw + 1;
  const maxNx = parent.x + parent.w - 1;
  if (minNx > maxNx) return null;
  const nx = minNx + Math.floor(rnd() * (maxNx - minNx + 1));
  const ny = parent.y - nh;
  return { id: "", x: nx, y: ny, w: nw, h: nh };
}

function tryPlaceSouth(parent: Rect, nw: number, nh: number, rnd: () => number): Rect | null {
  const minNx = parent.x - nw + 1;
  const maxNx = parent.x + parent.w - 1;
  if (minNx > maxNx) return null;
  const nx = minNx + Math.floor(rnd() * (maxNx - minNx + 1));
  const ny = parent.y + parent.h;
  return { id: "", x: nx, y: ny, w: nw, h: nh };
}

function tryPlaceEast(parent: Rect, nw: number, nh: number, rnd: () => number): Rect | null {
  const minNy = parent.y - nh + 1;
  const maxNy = parent.y + parent.h - 1;
  if (minNy > maxNy) return null;
  const ny = minNy + Math.floor(rnd() * (maxNy - minNy + 1));
  const nx = parent.x + parent.w;
  return { id: "", x: nx, y: ny, w: nw, h: nh };
}

function tryPlaceWest(parent: Rect, nw: number, nh: number, rnd: () => number): Rect | null {
  const minNy = parent.y - nh + 1;
  const maxNy = parent.y + parent.h - 1;
  if (minNy > maxNy) return null;
  const ny = minNy + Math.floor(rnd() * (maxNy - minNy + 1));
  const nx = parent.x - nw;
  return { id: "", x: nx, y: ny, w: nw, h: nh };
}

type Dir = "north" | "south" | "east" | "west";

const PLACERS: Record<Dir, (p: Rect, nw: number, nh: number, rnd: () => number) => Rect | null> = {
  north: tryPlaceNorth,
  south: tryPlaceSouth,
  east: tryPlaceEast,
  west: tryPlaceWest,
};

function normalizeOrigin(rects: Placed[]): void {
  let minX = Infinity;
  let minY = Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
  }
  for (const r of rects) {
    r.x -= minX;
    r.y -= minY;
  }
}

function computeExits(
  rects: Placed[],
): Map<string, { north: string | null; south: string | null; east: string | null; west: string | null }> {
  const out = new Map<string, { north: string | null; south: string | null; east: string | null; west: string | null }>();
  for (const r of rects) {
    out.set(r.id, { north: null, south: null, east: null, west: null });
  }

  for (const a of rects) {
    for (const b of rects) {
      if (a.id === b.id) continue;
      if (b.y + b.h === a.y && rangesOverlap(a.x, a.x + a.w, b.x, b.x + b.w)) {
        const ea = out.get(a.id)!;
        const eb = out.get(b.id)!;
        if (!ea.north) ea.north = b.id;
        if (!eb.south) eb.south = a.id;
      }
      if (a.x + a.w === b.x && rangesOverlap(a.y, a.y + a.h, b.y, b.y + b.h)) {
        const ea = out.get(a.id)!;
        const eb = out.get(b.id)!;
        if (!ea.east) ea.east = b.id;
        if (!eb.west) eb.west = a.id;
      }
    }
  }
  return out;
}

/** How many full edge-adjacent neighbors (used to spread growth across the frontier). */
function edgeNeighborCount(r: Placed, rects: Placed[]): number {
  let n = 0;
  for (const o of rects) {
    if (o.id === r.id) continue;
    if (o.y + o.h === r.y && rangesOverlap(r.x, r.x + r.w, o.x, o.x + o.w)) n++;
    if (r.y + r.h === o.y && rangesOverlap(r.x, r.x + r.w, o.x, o.x + o.w)) n++;
    if (o.x + o.w === r.x && rangesOverlap(r.y, r.y + r.h, o.y, o.y + o.h)) n++;
    if (r.x + r.w === o.x && rangesOverlap(r.y, r.y + r.h, o.y, o.y + o.h)) n++;
  }
  return n;
}

function unionSpreadWith(rects: Placed[], add: Placed): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  minX = Math.min(minX, add.x);
  minY = Math.min(minY, add.y);
  maxX = Math.max(maxX, add.x + add.w);
  maxY = Math.max(maxY, add.y + add.h);
  return maxX - minX + maxY - minY;
}

function pickParentIndex(rects: Placed[], rnd: () => number): number {
  const scored = rects.map((r, i) => {
    const isChamber = r.w > 1 && r.h > 1;
    const deg = edgeNeighborCount(r, rects);
    let w = rnd() * 0.35;
    if (isChamber) w += 0.45;
    w += Math.min(deg, 4) * 0.07;
    return { i, w };
  });
  scored.sort((a, b) => b.w - a.w);
  const topK = Math.min(3, scored.length);
  const pick = scored[Math.floor(rnd() * topK)]!;
  return pick.i;
}

function themeHints(theme: string): { place: string; mood: string; smell: string; sound: string } {
  const t = theme.toLowerCase();
  if (/swamp|bog|fen/.test(t)) {
    return {
      place: "swamp",
      mood: "damp and watchful",
      smell: "stagnant water and decay",
      sound: "distant croaking and dripping water",
    };
  }
  if (/underground|crypt|tomb|burial/.test(t)) {
    return {
      place: "underground complex",
      mood: "cold and echoing",
      smell: "earth and old stone",
      sound: "dripping water and your own footsteps",
    };
  }
  if (/forest|grove|wood/.test(t)) {
    return {
      place: "wilderness lair",
      mood: "overgrown and secretive",
      smell: "wet soil and pine",
      sound: "wind in the branches",
    };
  }
  if (/ice|frost|glacier/.test(t)) {
    return {
      place: "frozen ruin",
      mood: "biting cold",
      smell: "clean ice",
      sound: "creaking ice and wind",
    };
  }
  if (/volcano|lava|magma/.test(t)) {
    return {
      place: "volcanic cavern",
      mood: "stifling and bright with ember-light",
      smell: "sulfur and hot stone",
      sound: "distant rumbling",
    };
  }
  if (/ruin|temple|ancient/.test(t)) {
    return {
      place: "ancient ruin",
      mood: "heavy with history",
      smell: "dust and old incense",
      sound: "whispers of wind through cracks",
    };
  }
  return {
    place: "dungeon",
    mood: "tense and quiet",
    smell: "dust and damp stone",
    sound: "distant drips and scuttling",
  };
}

type MonsterPoolEntry = { slug: string; cr: number };

function pickMonsters(
  rnd: () => number,
  pool: MonsterPoolEntry[],
  count: number,
  targetCr: number,
): { monsterSlug: string; count: number; notes: string }[] {
  if (pool.length === 0) return [];
  const ranked = [...pool].sort((a, b) => Math.abs(a.cr - targetCr) - Math.abs(b.cr - targetCr));
  const pick = ranked[Math.floor(rnd() * Math.min(5, ranked.length))]!;
  const c = Math.min(4, 1 + Math.floor(rnd() * count));
  return [
    {
      monsterSlug: pick.slug,
      count: c,
      notes: `Tuned near CR ${targetCr.toFixed(2)} (picked ${pick.slug}, listed CR ${pick.cr}).`,
    },
  ];
}

function targetCrForDepth(depth: number, roomCount: number, partyLevel: number, isBoss: boolean): number {
  const pl = Math.max(1, Math.min(20, partyLevel));
  if (isBoss) return Math.min(30, pl + 2);
  if (depth <= 1) return Math.max(0, pl - 2);
  if (depth > Math.max(2, Math.floor(roomCount / 2))) return Math.min(30, pl + 1);
  return pl;
}

const NAMED_PRESETS: Record<
  "castle" | "dungeon" | "cave" | "sewer",
  Partial<Record<string, string[]>>
> = {
  castle: {
    boss: ["Throne of Ash", "High Seat of Blades", "Crownvault"],
    treasure: ["Regent's coffer", "Reliquary alcove"],
    lore: ["Weeping portrait hall", "Hall of banners"],
  },
  dungeon: {
    boss: ["Pit sovereign's roost", "Black Gate antechamber"],
    treasure: ["Weeping vault", "Dead king's tally room"],
    lore: ["Scriptorium ruin", "Whisper-gallery"],
    puzzle: ["Riddle antechamber", "False portcullis room"],
  },
  cave: {
    boss: ["Blooming fungus throne", "Deep echo niche"],
    treasure: ["Crystal cyst", "Bone cache"],
    rest: ["Dripstone bivouac"],
  },
  sewer: {
    boss: ["Grate king's sump", "Overflow heart"],
    trap: ["Sluice junction", "Grinding gate"],
  },
};

function rollNamedRoom(
  rnd: () => number,
  bucket: "castle" | "dungeon" | "cave" | "sewer",
  theme: ForgeThemeTag,
  type: ProceduralRoomType,
): string | null {
  if (rnd() > 0.42) return null;
  const table = NAMED_PRESETS[bucket];
  const key = type === "boss" ? "boss" : theme;
  const arr = (table as Record<string, string[] | undefined>)[key] ?? table.lore;
  if (arr?.length) return arr[Math.floor(rnd() * arr.length)]!;
  return null;
}

function rollThemeTag(
  rnd: () => number,
  type: ProceduralRoomType,
  depth: number,
  maxDepth: number,
  prev: ForgeThemeTag | null,
): ForgeThemeTag {
  if (type === "entrance") return "entrance";
  if (type === "boss") return "boss";
  if (type === "treasure") return "treasure";
  if (type === "trap") return "trap";
  const biasTreasure = prev === "boss" || prev === "lore";
  const r = rnd();
  if (biasTreasure && r < 0.22) return "treasure";
  if (r < 0.28) return "guard";
  if (r < 0.45) return "lore";
  if (r < 0.62) return "puzzle";
  if (r < 0.78) return "rest";
  if (depth >= maxDepth - 1 && r < 0.9) return "guard";
  return "lore";
}

const WALL_HINTS = ["north wall", "south wall", "east wall", "west wall", "corner debris", "old relief", "statue base"];
const TRIGGERS = [
  "loose brick",
  "hidden catch",
  "sconce that turns",
  "pressure ornament",
  "tilted floor tile",
  "iron ring under rubble",
];

function buildFeaturesForRoom(
  rnd: () => number,
  type: ProceduralRoomType,
  idx: number,
  hints: ReturnType<typeof themeHints>,
  exitCount: number,
  hasListedTreasure: boolean,
): RoomDmFeatures | null {
  const features: RoomDmFeatures = {};

  if (type !== "entrance" && type !== "corridor" && exitCount >= 2 && rnd() < 0.22) {
    features.secretDoors = [
      {
        wall: WALL_HINTS[Math.floor(rnd() * WALL_HINTS.length)]!,
        trigger: TRIGGERS[Math.floor(rnd() * TRIGGERS.length)]!,
        perceptionDc: 13 + Math.floor(rnd() * 5),
        investigationDc: 12 + Math.floor(rnd() * 4),
        destination: "Connects to a narrow space or parallel passage (place on map or treat as shortcut).",
      },
    ];
  }

  if (
    !hasListedTreasure &&
    (type === "chamber" || type === "corridor") &&
    rnd() < (type === "corridor" ? 0.12 : 0.18)
  ) {
    features.hiddenStashes = [
      {
        label: rnd() < 0.5 ? "Hollow mortar / loose stone" : "False-bottom crate",
        investigationDc: 13 + Math.floor(rnd() * 5),
        contents: `${5 + Math.floor(rnd() * 25)} gp or trade goods; optional minor consumable`,
      },
    ];
  }

  if (rnd() < 0.28 && type !== "corridor") {
    const clues = [
      {
        label: "Odd carving",
        playerClue: "Weathered symbols mark the stone — meaning unclear.",
        dmDetail: `Relates to local faction or hazard in this ${hints.place}; may hint at trap placement or treasure.`,
      },
      {
        label: "Tracks or refuse",
        playerClue: "Scuffed dust and recent droppings suggest regular traffic.",
        dmDetail: "Supports an encounter or warns of patrol timing.",
      },
      {
        label: "Cold spot / draft",
        playerClue: "The air shifts here; hair stands on end.",
        dmDetail: "Foreshadows undead, elemental, or a vent to a lower level.",
      },
    ];
    features.pointsOfInterest = [clues[Math.floor(rnd() * clues.length)]!];
  }

  if (!features.secretDoors && !features.hiddenStashes && !features.pointsOfInterest) return null;
  return features;
}

function exitCardinality(ex: { north: string | null; south: string | null; east: string | null; west: string | null }): number {
  return [ex.north, ex.south, ex.east, ex.west].filter(Boolean).length;
}

function playerLabelForType(type: ProceduralRoomType, idx: number, hints: ReturnType<typeof themeHints>): string {
  if (type === "entrance") return "Entrance";
  if (type === "corridor") return "Passage";
  if (type === "boss") return "Large hall";
  if (type === "treasure") return "Dusty chamber";
  if (type === "trap") return "Uneven hall";
  return `Side chamber ${idx}`;
}

/**
 * Grow a connected dungeon by attaching rectangles with edge-to-edge contact.
 * Corridors are thin strips; parent selection and multi-candidate scoring reduce “snake” layouts.
 */
export function generateProceduralRooms(opts: {
  theme: string;
  roomCount: number;
  difficulty: string;
  levelMin: number;
  levelMax: number;
  monsterPool: MonsterPoolEntry[];
  mapSeed?: number | string | null;
}): {
  mapSeed: number;
  name: string;
  description: string;
  story: string;
  npcs: { name: string; role: string; description: string }[];
  rooms: ProceduralRoomDraft[];
} {
  const target = Math.min(22, Math.max(5, Math.floor(opts.roomCount)));
  const mapSeed = resolveMapSeed(opts.mapSeed, opts.theme, target, opts.difficulty);
  const rnd = mulberry32(mapSeed);
  const hints = themeHints(opts.theme);

  const bucket = inferLocationBucket(opts.theme);
  const rects: Placed[] = [];
  const ew = 3 + Math.floor(rnd() * 2);
  const eh = 2 + Math.floor(rnd() * 2);
  rects.push({
    id: "room_0",
    x: 0,
    y: 0,
    w: ew,
    h: eh,
    shape: "rect",
    mask: shapeMask("rect", ew, eh, rnd),
  });

  let attempts = 0;
  const maxAttempts = 6000;
  while (rects.length < target && attempts < maxAttempts) {
    attempts++;
    const parent = rects[pickParentIndex(rects, rnd)]!;

    const corridors = rects.filter((r) => r.w === 1 || r.h === 1).length;
    const ratio = corridors / Math.max(1, rects.length);
    const targetRatio = 0.3 + rnd() * 0.1;
    const corridorBias = ratio < targetRatio ? 0.52 : 0.3;

    let nw: number;
    let nh: number;
    if (rnd() < corridorBias) {
      if (rnd() < 0.5) {
        nw = 1;
        nh = 2 + Math.floor(rnd() * 5);
      } else {
        nw = 2 + Math.floor(rnd() * 5);
        nh = 1;
      }
    } else {
      nw = 2 + Math.floor(rnd() * 4);
      nh = 2 + Math.floor(rnd() * 4);
    }

    const dirs: Dir[] = ["north", "south", "east", "west"];
    for (let i = dirs.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [dirs[i], dirs[j]] = [dirs[j]!, dirs[i]!];
    }

    const candidates: Placed[] = [];
    for (const d of dirs) {
      const cand = PLACERS[d]!(parent, nw, nh, rnd);
      if (!cand) continue;
      cand.id = `room_${rects.length}`;
      const shape = pickShapeForBucket(bucket, rnd);
      const mask = shapeMask(shape, cand.w, cand.h, rnd);
      const placed: Placed = { ...cand, shape, mask };
      if (!rects.some((r) => masksOverlap(placed.x, placed.y, placed.mask, r.x, r.y, r.mask))) candidates.push(placed);
    }

    if (candidates.length === 0) continue;

    let best = candidates[0]!;
    let bestScore = unionSpreadWith(rects, best);
    for (let i = 1; i < candidates.length; i++) {
      const c = candidates[i]!;
      const sc = unionSpreadWith(rects, c);
      if (sc > bestScore || (sc === bestScore && rnd() < 0.5)) {
        best = c;
        bestScore = sc;
      }
    }
    rects.push(best);
  }

  normalizeOrigin(rects);
  const exitMap = computeExits(rects);
  const depths = bfsDepths(exitMap, "room_0");
  const maxDepth = Math.max(0, ...[...depths.values()]);

  const chamberIndices = rects
    .map((r, i) => ({ i, area: r.w * r.h, d: depths.get(r.id) ?? 0 }))
    .filter((x) => x.i !== 0 && rects[x.i]!.w > 1 && rects[x.i]!.h > 1)
    .sort((a, b) => {
      if (b.d !== a.d) return b.d - a.d;
      return b.area - a.area;
    })
    .map((x) => x.i);

  const bossIdx = chamberIndices[0] ?? -1;
  const trapIdx = chamberIndices.find((i) => i !== bossIdx) ?? -1;
  const treasureIdx = chamberIndices.find((i) => i !== bossIdx && i !== trapIdx) ?? -1;

  const themeById = new Map<string, ForgeThemeTag>();
  const bfsOrder: string[] = [];
  {
    const seen = new Set<string>();
    const q = ["room_0"];
    seen.add("room_0");
    while (q.length) {
      const id = q.shift()!;
      bfsOrder.push(id);
      const ex = exitMap.get(id)!;
      for (const n of [ex.north, ex.south, ex.east, ex.west] as const) {
        if (!n || seen.has(n)) continue;
        seen.add(n);
        q.push(n);
      }
    }
  }
  let prevTheme: ForgeThemeTag | null = null;
  for (const id of bfsOrder) {
    const idx = rects.findIndex((r) => r.id === id);
    if (idx < 0) continue;
    let t: ProceduralRoomType = "chamber";
    if (idx === 0) t = "entrance";
    else if (rects[idx]!.w === 1 || rects[idx]!.h === 1) t = "corridor";
    else if (bossIdx >= 0 && idx === bossIdx) t = /hard|deadly/.test(opts.difficulty.toLowerCase()) ? "boss" : "chamber";
    else if (trapIdx >= 0 && idx === trapIdx) t = "trap";
    else if (treasureIdx >= 0 && idx === treasureIdx) t = "treasure";
    const depth = depths.get(id) ?? 0;
    const tag = rollThemeTag(rnd, t, depth, maxDepth, prevTheme);
    themeById.set(id, tag);
    prevTheme = tag;
  }

  const rooms: ProceduralRoomDraft[] = rects.map((r, idx) => {
    const isCorridor = r.w === 1 || r.h === 1;
    let type: ProceduralRoomType = "chamber";
    if (idx === 0) type = "entrance";
    else if (isCorridor) type = "corridor";
    else if (bossIdx >= 0 && idx === bossIdx) type = /hard|deadly/.test(opts.difficulty.toLowerCase()) ? "boss" : "chamber";
    else if (trapIdx >= 0 && idx === trapIdx) type = "trap";
    else if (treasureIdx >= 0 && idx === treasureIdx) type = "treasure";

    const ex = exitMap.get(r.id)!;
    const roomName = (() => {
      if (type === "entrance") return "Entrance";
      if (type === "corridor") return r.w > r.h ? "Passage" : "Hallway";
      if (type === "boss") return "Heart of the Lair";
      if (type === "treasure") return "Hidden Cache";
      if (type === "trap") return "Trapped Chamber";
      return `Chamber ${idx}`;
    })();

    const playerLabel = playerLabelForType(type, idx, hints);

    const playerDescription = (() => {
      if (type === "entrance") {
        return `A way into the ${hints.place}: ${hints.sound}, air smells of ${hints.smell}.`;
      }
      if (type === "corridor") {
        return "A narrow stretch of worked stone — easy to get jumped here.";
      }
      if (type === "treasure") {
        return "Dusty flagstones and fallen debris — something might be buried here.";
      }
      if (type === "trap") {
        return "The floor and walls look uneven; loose grit shifts underfoot.";
      }
      if (type === "boss") {
        return "A wider space opens ahead — sound carries oddly here.";
      }
      return `A ${hints.mood} space, part of this ${hints.place}.`;
    })();

    const description = (() => {
      if (type === "entrance") {
        return `Entry to the site. Light fades quickly; describe how the passage continues (matches map exits).`;
      }
      if (type === "corridor") {
        return `Line-of-sight break; good for ambushes, chase scenes, or hearing noise from linked rooms.`;
      }
      if (type === "boss") {
        return `Climax arena: use cover, elevation, or hazards from the theme. Creature choice should match party level.`;
      }
      if (type === "treasure") {
        return `Reward location; you may hide a lockbox, shrine offering, or fallen adventurer's pack.`;
      }
      if (type === "trap") {
        return `Mechanical or magical hazard themed to ${hints.place}; see traps + dmSecrets.`;
      }
      return `General-purpose room: debris, furniture, or environmental storytelling tied to "${opts.theme}".`;
    })();

    const dmSecrets = (() => {
      if (type === "trap") {
        const dc = 12 + Math.floor(rnd() * 5);
        return `- Trap: concealed pit or dart gallery (Perception DC ${dc} to spot)\n- Failure: 2d6 damage + brief hindered movement (DM choice)`;
      }
      if (type === "treasure") {
        return `- True haul: coin + one useful consumable (roll or pick)\n- Optional: hidden compartment (Investigation DC 14)`;
      }
      if (type === "boss") {
        return `- Reinforcements might arrive if combat is loud\n- Terrain use: columns, water, or choke points per map`;
      }
      return `- Listen checks toward connected rooms (DC 12) may hear occupants\n- One mundane clue about the faction or purpose of this place`;
    })();

    const depth = depths.get(r.id) ?? 0;
    const partyLv = opts.levelMax;
    const tgt = targetCrForDepth(depth, rects.length, partyLv, type === "boss");

    let monsters: { monsterSlug: string; count: number; notes: string }[] = [];
    if (type === "boss" || (type === "chamber" && rnd() < 0.45 && idx !== 0)) {
      monsters = pickMonsters(rnd, opts.monsterPool, type === "boss" ? 3 : 2, tgt);
    }

    let treasures = { gold: 0, items: [] as string[] };
    if (type === "treasure") {
      treasures = {
        gold: 15 + Math.floor(rnd() * 45) * (opts.levelMax + 1),
        items: rnd() < 0.6 ? ["healing potion"] : ["torch", "rope"],
      };
    } else if (type === "chamber" && rnd() < 0.2) {
      treasures = { gold: 5 + Math.floor(rnd() * 20), items: [] };
    }

    let traps: ProceduralRoomDraft["traps"] = null;
    if (type === "trap") {
      traps = {
        name: "Environmental hazard",
        description: "Pressure plate or tripwire themed to the location.",
        dc: 13 + Math.floor(rnd() * 4),
        damage: "2d6",
      };
    }

    const hasListedTreasure = treasures.gold > 0 || (treasures.items?.length ?? 0) > 0;
    const baseFeatures = buildFeaturesForRoom(rnd, type, idx, hints, exitCardinality(ex), hasListedTreasure);
    const themeTag = themeById.get(r.id) ?? "lore";
    const namedRoom = rollNamedRoom(rnd, bucket, themeTag, type);
    const layoutMeta = {
      shape: r.shape,
      depth,
      themeTag,
      namedRoom,
    };
    const features: RoomDmFeatures | null = baseFeatures
      ? { ...baseFeatures, layoutMeta }
      : { layoutMeta };

    let featLines = "";
    if (features?.secretDoors?.length) {
      featLines += features.secretDoors.map((d) => `- Secret: ${d.wall} — ${d.trigger} (see Features panel)`).join("\n") + "\n";
    }
    if (features?.hiddenStashes?.length) {
      featLines += features.hiddenStashes.map((h) => `- Hidden stash: ${h.label}`).join("\n") + "\n";
    }
    const dmSecretsCombined = [dmSecrets.trim(), featLines.trim()].filter(Boolean).join("\n");

    return {
      id: r.id,
      name: roomName,
      playerLabel,
      type,
      x: r.x,
      y: r.y,
      width: r.w,
      height: r.h,
      exits: { north: ex.north, south: ex.south, east: ex.east, west: ex.west },
      playerDescription,
      description,
      dmSecrets: dmSecretsCombined,
      monsters,
      treasures,
      traps,
      features,
      notes: "",
    };
  });

  const titleCase = opts.theme
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  const name = `${titleCase || "Procedural"} — ${hints.place}`;
  const description = `A ${hints.place} laid out as a coherent grid map (${rects.length} areas). Difficulty ${opts.difficulty}; levels ${opts.levelMin}–${opts.levelMax}. Map seed ${mapSeed} — reuse this seed to recreate the layout.`;
  const story = `Rumors led the party to this ${hints.place}: ${hints.mood}, marked by ${hints.sound}. What they find inside is yours to reveal — the map shows how chambers connect.`;
  const npcs = [
    {
      name: "The place itself",
      role: "neutral",
      description: `Use faction hooks tied to "${opts.theme}"; no NPC was rolled for this procedural map.`,
    },
  ];

  return { mapSeed, name, description, story, npcs, rooms };
}
