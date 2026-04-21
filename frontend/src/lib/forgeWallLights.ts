import type { SceneLight } from "@/lib/playerMapBroadcast";
import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";
import { isDungeonGridWalkable } from "@/lib/dungeonForgeFog";

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

/** Fey forest — cool teal wisps along open floor (bioluminescent mood). */
export function collectFeyForestWispLights(
  grid: number[][],
  rng: () => number,
  max = 8,
): SceneLight[] {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const floor: { gx: number; gy: number }[] = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      if (grid[y]?.[x] === T.F || grid[y]?.[x] === T.C) floor.push({ gx: x, gy: y });
    }
  }
  const out: SceneLight[] = [];
  const pool = [...floor];
  const n = Math.min(max, pool.length);
  for (let i = 0; i < n; i++) {
    const j = Math.floor(rng() * pool.length);
    const p = pool.splice(j, 1)[0]!;
    out.push({ gx: p.gx, gy: p.gy, radiusCells: 4, intensity: 0.09, kind: "torch" });
  }
  return out;
}

/** Volcanic lair — warm rim lights near lava tiles. */
export function collectVolcanicLavaGlowLights(grid: number[][], max = 12): SceneLight[] {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const out: SceneLight[] = [];
  for (let y = 1; y < H - 1 && out.length < max; y++) {
    for (let x = 1; x < W - 1 && out.length < max; x++) {
      if (grid[y][x] !== T.LAVA) continue;
      const touches =
        grid[y - 1]?.[x] === T.F ||
        grid[y + 1]?.[x] === T.F ||
        grid[y]?.[x - 1] === T.F ||
        grid[y]?.[x + 1] === T.F;
      if (touches) {
        out.push({ gx: x, gy: y, radiusCells: 6, intensity: 0.16, kind: "torch" });
      }
    }
  }
  return out;
}

type DecoLite = Record<string, unknown>;

/** Cave bioluminescent — dim teal glow from glowing moss + glowing mushroom clusters (Forge DM view). */
export function collectCaveBiolumSceneLights(decoOverlay: DecoLite[] | null | undefined, max = 48): SceneLight[] {
  if (!decoOverlay?.length) return [];
  const out: SceneLight[] = [];
  for (const d of decoOverlay) {
    const key = String(d.decoKey ?? "");
    const mk = String((d as { mushroomKind?: string }).mushroomKind ?? "");
    if (key === "glowing_moss") {
      const x = Number(d.x),
        y = Number(d.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        out.push({ gx: x, gy: y, radiusCells: 3, intensity: 0.07, kind: "torch" });
      }
    } else if (key === "mushroom_cluster" && mk === "glowing") {
      const x = Number(d.x),
        y = Number(d.y);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        out.push({ gx: x, gy: y, radiusCells: 4, intensity: 0.1, kind: "room" });
      }
    }
    if (out.length >= max) break;
  }
  return out;
}

const MAX_BIOME_LIGHTS = 48;
/** Streets + yards need many warm points; room-based cap is too low for towns. */
const MAX_TOWN_STREET_LIGHTS = 64;

/**
 * Biome-aware fixture lights for Dungeon Forge maps (deterministic from `seed`).
 */
export type CollectBiomeLightsOpts = {
  /** When false, fey forest uses dim torches instead of wisps. */
  feyBioluminescent?: boolean;
};

/**
 * Warm lights along roads / lots that face building walls (street lamps / façade pools).
 * Positions are always on walkable tiles (roads & yards); lights are not placed on wall cells
 * so occlusion does not zero them out.
 */
export function collectTownStreetLights(grid: number[][], seed: number, max = MAX_TOWN_STREET_LIGHTS): SceneLight[] {
  const rng = makeSeededRng(seed >>> 0);
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  const roadish = (t: number | undefined) =>
    t === T.ROAD || t === T.BRIDGE || t === T.ALLEY;
  const yardish = (t: number | undefined) => t === T.F || t === T.P;

  const touchesWall = (x: number, y: number) => {
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      if (grid[y + dy]?.[x + dx] === T.W) return true;
    }
    return false;
  };

  const candidates: { gx: number; gy: number; pri: number }[] = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const t = grid[y][x];
      if (!roadish(t) && !yardish(t)) continue;
      if (!touchesWall(x, y)) continue;
      let roadArms = 0;
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const) {
        if (roadish(grid[y + dy]?.[x + dx])) roadArms++;
      }
      const pri = roadish(t) ? roadArms * 4 + 2 : roadArms;
      candidates.push({ gx: x, gy: y, pri });
    }
  }

  candidates.sort((a, b) => b.pri - a.pri);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = a;
  }

  const out: SceneLight[] = [];
  const used: { x: number; y: number }[] = [];
  const minCheb = 3;

  for (const c of candidates) {
    if (out.length >= max) break;
    if (used.some((u) => Math.max(Math.abs(c.gx - u.x), Math.abs(c.gy - u.y)) < minCheb)) continue;
    used.push({ x: c.gx, y: c.gy });
    out.push({
      gx: c.gx,
      gy: c.gy,
      radiusCells: 4.2 + rng() * 2.4,
      intensity: 0.22 + rng() * 0.14,
      kind: "torch",
      flicker: true,
    });
  }
  return out;
}

/**
 * Corridor / junction / door-adjacent torches so dungeons are not stuck with 1–2 random room picks.
 * Prioritizes T-junctions, corners beside doors, and long corridor runs (deterministic spacing).
 */
export function collectDungeonCorridorTorchPlacements(
  grid: number[][],
  seed: number,
  max: number,
  locationType: string,
): SceneLight[] {
  const rng = makeSeededRng((seed ^ 0xbadcafe) >>> 0);
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  if (W < 3 || H < 3 || max < 1) return [];

  type Cand = { gx: number; gy: number; score: number };
  const candidates: Cand[] = [];

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const t = grid[y]![x]!;
      if (t !== T.C && t !== T.F) continue;
      if (!isDungeonGridWalkable(t, locationType)) continue;

      let corrArms = 0;
      let doorAdj = 0;
      let wallAdj = 0;
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ] as const) {
        const nt = grid[y + dy]?.[x + dx];
        if (nt === T.C) corrArms++;
        if (nt === T.D || nt === T.SECRET_DOOR || nt === T.GATE || nt === T.DRAWBRIDGE) doorAdj++;
        if (nt === T.W) wallAdj++;
      }

      let score = corrArms * 3 + doorAdj * 8 + wallAdj;
      if (corrArms >= 3) score += 12;
      else if (corrArms === 2 && doorAdj > 0) score += 10;
      if (score < 3) continue;

      candidates.push({ gx: x, gy: y, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.gx - b.gx || a.gy - b.gy);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = candidates[i]!;
    candidates[i] = candidates[j]!;
    candidates[j] = a;
  }

  const out: SceneLight[] = [];
  const used: { gx: number; gy: number }[] = [];
  const minCheb = 3;

  for (const c of candidates) {
    if (out.length >= max) break;
    if (used.some((u) => Math.max(Math.abs(c.gx - u.gx), Math.abs(c.gy - u.gy)) < minCheb)) continue;
    used.push({ gx: c.gx, gy: c.gy });
    out.push({
      gx: c.gx,
      gy: c.gy,
      radiusCells: 4.4 + rng() * 1.4,
      intensity: 0.28 + rng() * 0.12,
      kind: "torch",
      flicker: true,
    });
  }

  return out;
}

export function collectBiomeLights(
  grid: number[][],
  rooms: Array<{ x: number; y: number; w: number; h: number }>,
  locationType: string,
  seed: number,
  opts?: CollectBiomeLightsOpts | null,
): SceneLight[] {
  const rng = makeSeededRng(seed >>> 0);
  const out: SceneLight[] = [];
  const H = grid.length;
  const W = grid[0]?.length ?? 0;

  const push = (L: SceneLight) => {
    if (out.length >= MAX_BIOME_LIGHTS) return;
    out.push(L);
  };

  const pushTown = (L: SceneLight) => {
    if (out.length >= MAX_TOWN_STREET_LIGHTS) return;
    out.push(L);
  };

  const addFromRooms = (perRoom: number, mk: (gx: number, gy: number) => SceneLight) => {
    for (const room of rooms) {
      if (out.length >= MAX_BIOME_LIGHTS) return;
      const cells = pickWallAdjacentFloorCells(grid, room, perRoom, rng);
      for (const c of cells) push(mk(c.gx, c.gy));
    }
  };

  const addCorridorTorches = (loc: string, cap: number) => {
    for (const L of collectDungeonCorridorTorchPlacements(grid, seed, cap, loc)) {
      push(L);
    }
  };

  switch (locationType) {
    case "dungeon":
      addFromRooms(3, (gx, gy) => ({
        gx,
        gy,
        radiusCells: 4 + rng() * 1,
        intensity: 0.42,
        kind: "torch",
        flicker: true,
      }));
      addCorridorTorches("dungeon", 18);
      break;

    case "cave": {
      const fungi = rng() < 0.35;
      if (fungi) {
        for (let t = 0; t < 80 && out.length < MAX_BIOME_LIGHTS; t++) {
          const gx = 2 + Math.floor(rng() * Math.max(1, W - 4));
          const gy = 2 + Math.floor(rng() * Math.max(1, H - 4));
          if (grid[gy]?.[gx] !== T.F && grid[gy]?.[gx] !== T.C) continue;
          push({ gx, gy, radiusCells: 3, intensity: 0.1, kind: "fey", flicker: false });
        }
      } else {
        addFromRooms(1, (gx, gy) => ({
          gx,
          gy,
          radiusCells: 3,
          intensity: 0.2,
          kind: "torch",
          flicker: true,
        }));
      }
      break;
    }

    case "temple":
      addFromRooms(3, (gx, gy) => ({
        gx,
        gy,
        radiusCells: 5,
        intensity: 0.36,
        kind: "divine",
        flicker: false,
      }));
      addCorridorTorches("temple", 12);
      if (rng() < 0.22 && rooms[0]) {
        const r = rooms[Math.floor(rng() * rooms.length)]!;
        const cells = pickWallAdjacentFloorCells(grid, r, 1, rng);
        const c = cells[0];
        if (c) push({ gx: c.gx, gy: c.gy, radiusCells: 2, intensity: 0.28, kind: "magic", flicker: true });
      }
      break;

    case "graveyard":
      addFromRooms(2, (gx, gy) => ({
        gx,
        gy,
        radiusCells: 2,
        intensity: 0.22,
        kind: "cold",
        flicker: true,
      }));
      break;

    case "volcanic_lair": {
      for (const L of collectVolcanicLavaGlowLights(grid, 10)) {
        push({ ...L, kind: "lava", flicker: true, intensity: L.intensity ?? 0.2 });
      }
      addFromRooms(1, (gx, gy) => ({
        gx,
        gy,
        radiusCells: 5,
        intensity: 0.34,
        kind: "fire",
        flicker: true,
      }));
      break;
    }

    case "fey_forest":
      if (opts?.feyBioluminescent === false) {
        addFromRooms(1, (gx, gy) => ({
          gx,
          gy,
          radiusCells: 3,
          intensity: 0.14,
          kind: "torch",
          flicker: true,
        }));
      } else {
        for (const L of collectFeyForestWispLights(grid, rng, 8)) {
          push({ ...L, kind: "wisp", radiusCells: 3, intensity: 0.12, flicker: false });
        }
      }
      break;

    case "sewer":
      addFromRooms(3, (gx, gy) => ({
        gx,
        gy,
        radiusCells: 3,
        intensity: 0.08,
        kind: "lantern",
        flicker: false,
      }));
      addCorridorTorches("sewer", 14);
      break;

    case "castle":
      addFromRooms(3, (gx, gy) => ({
        gx,
        gy,
        radiusCells: 5,
        intensity: 0.4,
        kind: "torch",
        flicker: true,
      }));
      addCorridorTorches("castle", 16);
      break;

    case "swamp":
      addFromRooms(2, (gx, gy) => ({
        gx,
        gy,
        radiusCells: 2,
        intensity: 0.16,
        kind: "wisp",
        color: "#80ffff",
        flicker: true,
      }));
      break;

    case "town":
    case "road": {
      for (const L of collectTownStreetLights(grid, seed, MAX_TOWN_STREET_LIGHTS)) {
        pushTown(L);
      }
      break;
    }

    default:
      addFromRooms(2, (gx, gy) => ({
        gx,
        gy,
        radiusCells: 4.5,
        intensity: 0.38,
        kind: "torch",
        flicker: true,
      }));
      addCorridorTorches(locationType || "dungeon", 10);
      break;
  }

  return out;
}
