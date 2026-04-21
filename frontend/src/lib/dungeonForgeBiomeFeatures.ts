/**
 * Distinct generation + post-process for Road (wilderness), Volcanic Lair, and Fey Forest.
 * Called from Dungeon Forge after base layout exists.
 */
import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";

export type RoadVariant = "dirt_trail" | "kings_highway" | "mountain_pass";

export type ForgeBiomeSession = {
  road?: {
    variant: RoadVariant;
    travelTiles: number;
    travelFeet: number;
    paceHours: { normal: number; fast: number; slow: number };
    encounterZones: { x: number; y: number; w: number; h: number; tier: "safe" | "uncommon" | "danger"; note: string }[];
    riverCrossing?: { x: number; y: number; kind: "ford" | "bridge"; note: string };
    banditCamp?: { x: number; y: number; note: string };
  };
  volcanic?: {
    lavaRiverCells: number;
    forgeRoomId?: number;
    salamanderRoomId?: number;
    cooledTreasureRoomId?: number;
    hangingCage?: { x: number; y: number; note: string };
    geysers: { x: number; y: number; note: string }[];
    obsidianPillars: { x: number; y: number; note: string }[];
    tremor: "dormant" | "active" | "erupting";
    eruptionRounds: number;
    heatRule: string;
  };
  fey?: {
    feyCircle?: { x: number; y: number; note: string };
    archfeyCourtRoomId?: number;
    timeDilationRoomId?: number;
    illusoryCells: { x: number; y: number }[];
    shiftingPathsNote: string;
    glamourChestRoomId?: number;
    ancientTrees: number;
    thornRooms: number[];
  };
};

type EntityRec = Record<string, unknown> & { x: number; y: number; type: string; name?: string };
type DecoRec = Record<string, unknown> & { x: number; y: number; ch: string; name?: string; fg?: string; decoKey?: string };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

/** Hub rooms along the road spine — typed so `cx`/`cy` are numbers for `roadCarvePath`. */
type RoadHubRoom = {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  type: string;
  label: string;
};

function rI(a: number, b: number, rng: () => number) {
  return Math.floor(rng() * (b - a + 1)) + a;
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function roadCarvePath(
  grid: number[][],
  a: { cx: number; cy: number },
  b: { cx: number; cy: number },
  W: number,
  H: number,
  rng: () => number,
) {
  let x = a.cx;
  let y = a.cy;
  const goH = rng() < 0.5;
  const tileType = T.ROAD;
  /** Wilderness: carve through grass/floor/void — do not paint dungeon wall halos. */
  const canCarve = (t: number | undefined) => t === T.V || t === T.W || t === T.F;
  const carve = (cx: number, cy: number) => {
    if (cy >= 0 && cy < H && cx >= 0 && cx < W) {
      if (canCarve(grid[cy][cx])) grid[cy][cx] = tileType;
      for (const d of [-1, 1]) {
        if (cy + d >= 0 && cy + d < H && canCarve(grid[cy + d][cx])) grid[cy + d][cx] = tileType;
        if (cx + d >= 0 && cx + d < W && canCarve(grid[cy][cx + d])) grid[cy][cx + d] = tileType;
      }
    }
  };
  if (goH) {
    while (x !== b.cx) {
      carve(x, y);
      x += x < b.cx ? 1 : -1;
    }
    carve(x, y);
    while (y !== b.cy) {
      carve(x, y);
      y += y < b.cy ? 1 : -1;
    }
    carve(x, y);
  } else {
    while (y !== b.cy) {
      carve(x, y);
      y += y < b.cy ? 1 : -1;
    }
    carve(x, y);
    while (x !== b.cx) {
      carve(x, y);
      x += x < b.cx ? 1 : -1;
    }
    carve(x, y);
  }
}

/** Replace linear road — variant-specific spine + flanking terrain. */
export function generateRoadVariantLayout(
  cfg: { width: number; height: number; roomCount: number; roadVariant?: RoadVariant },
  rng: () => number,
): { grid: number[][]; rooms: RoadHubRoom[] } {
  const W = cfg.width;
  const H = cfg.height;
  const variant: RoadVariant = cfg.roadVariant ?? "dirt_trail";
  /** Open wilderness turf — not dungeon void; avoids auto-walls reading as “indoors”. */
  const grid = Array.from({ length: H }, () => Array<number>(W).fill(T.F));
  const mid = Math.floor(H / 2);
  const rooms: RoadHubRoom[] = [];

  const carveRoadCell = (x: number, y: number, wide: number) => {
    for (let w = 0; w < wide; w++) {
      const yy = y + w;
      if (yy >= 1 && yy < H - 1 && x >= 1 && x < W - 1) grid[yy][x] = T.ROAD;
    }
  };

  let spineY = mid;
  const roadWide = variant === "kings_highway" ? 2 : 1;

  for (let x = 3; x < W - 3; x++) {
    if (variant === "dirt_trail" && rng() < 0.18) {
      spineY = clamp(spineY + (rng() < 0.5 ? -1 : 1), 3, H - 4);
    } else if (variant === "kings_highway" && rng() < 0.06) {
      spineY = clamp(spineY + (rng() < 0.5 ? -1 : 1), 4, H - 5);
    } else if (variant === "mountain_pass") {
      if (rng() < 0.12) spineY = clamp(spineY + (rng() < 0.5 ? -1 : 1), 4, H - 5);
    }
    carveRoadCell(x, spineY - (variant === "kings_highway" ? 1 : 0), roadWide);
    if (variant === "mountain_pass") {
      if (spineY - 2 >= 1) grid[spineY - 2][x] = T.W;
      if (spineY + roadWide + 1 < H - 1) grid[spineY + roadWide + 1][x] = T.W;
    }
  }

  const n = Math.min(cfg.roomCount, Math.max(2, Math.floor(W / 22)));
  const hubRooms = [
    "Wayside Inn",
    "Merchant Camp",
    "Bridge",
    "Crossroads",
    "Watch Post",
    "Ruined Tower",
    "Roadside Shrine",
    "Bandit Lair",
    "Ferry Landing",
    "Toll Station",
  ];
  for (let i = 0; i < n; i++) {
    const cx = 8 + Math.floor(((i + 1) / (n + 1)) * (W - 16));
    const rw = rI(6, 10, rng);
    const rh = rI(4, 7, rng);
    const rx = clamp(cx - Math.floor(rw / 2), 3, W - rw - 3);
    const north = rng() < 0.5;
    const ry = north ? spineY - rh - 3 : spineY + roadWide + 2;
    if (ry < 2 || ry + rh >= H - 2) continue;
    let bad = false;
    for (const r of rooms) {
      const rx0 = r.x as number;
      const ry0 = r.y as number;
      const rw0 = r.w as number;
      const rh0 = r.h as number;
      if (rx < rx0 + rw0 + 3 && rx + rw + 3 > rx0 && ry < ry0 + rh0 + 3 && ry + rh + 3 > ry0) {
        bad = true;
        break;
      }
    }
    if (bad) continue;
    /** Roadside clearing / yard — floor only; no perimeter walls (reads as outdoor camp, not a room). */
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) grid[y][x] = T.F;
    const roomType = pick(hubRooms, rng);
    const rm = {
      id: rooms.length + 1,
      x: rx,
      y: ry,
      w: rw,
      h: rh,
      cx: Math.floor(rx + rw / 2),
      cy: Math.floor(ry + rh / 2),
      type: roomType,
      label: roomType,
    };
    rooms.push(rm);
    const linkCy = north ? spineY + roadWide : spineY - 1;
    roadCarvePath(grid, rm, { cx: rm.cx, cy: clamp(linkCy, 2, H - 3) }, W, H, rng);
    if (rooms.length > 1) {
      const prev = rooms[rooms.length - 2]!;
      roadCarvePath(grid, { cx: prev.cx, cy: prev.cy }, { cx: rm.cx, cy: rm.cy }, W, H, rng);
    }
  }

  if (rooms.length === 0) {
    const rw = 12;
    const rh = 6;
    const rx = Math.floor((W - rw) / 2);
    const ry = spineY - rh - 4;
    for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) if (y > 1 && y < H - 2 && x > 1 && x < W - 2) grid[y][x] = T.F;
    const r0 = {
      id: 1,
      x: rx,
      y: ry,
      w: rw,
      h: rh,
      cx: Math.floor(rx + rw / 2),
      cy: Math.floor(ry + rh / 2),
      type: "Crossroads",
      label: "Crossroads",
    };
    rooms.push(r0);
    roadCarvePath(grid, r0, { cx: r0.cx, cy: clamp(spineY + roadWide, 2, H - 3) }, W, H, rng);
  }

  return { grid, rooms };
}

function countRoadTiles(grid: number[][]) {
  let n = 0;
  for (const row of grid) for (const t of row) if (t === T.ROAD || t === T.BRIDGE) n++;
  return n;
}

/** After rooms + grid exist for road maps. */
export function postProcessRoadWilderness(
  grid: number[][],
  rooms: Array<{ x: number; y: number; w: number; h: number; id: number }>,
  entities: EntityRec[],
  decoOverlay: DecoRec[],
  cfg: { roadVariant?: RoadVariant; width: number; height: number },
  rng: () => number,
): ForgeBiomeSession["road"] {
  const W = cfg.width;
  const H = grid.length;
  const variant = cfg.roadVariant ?? "dirt_trail";
  const travelTiles = countRoadTiles(grid);
  const travelFeet = travelTiles * 5;
  const paceHours = {
    normal: Math.round((travelFeet / 300) * 10) / 10,
    fast: Math.round((travelFeet / 400) * 10) / 10,
    slow: Math.round((travelFeet / 200) * 10) / 10,
  };

  const roadCells: { x: number; y: number }[] = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (grid[y][x] === T.ROAD) roadCells.push({ x, y });

  const encounterZones: NonNullable<ForgeBiomeSession["road"]>["encounterZones"] = [];
  let zi = 0;
  for (const r of rooms) {
    const nearGuard = /watch|inn|toll|crossroads/i.test(String((r as { label?: string }).label ?? ""));
    const tier: "safe" | "uncommon" | "danger" = nearGuard ? "safe" : zi % 3 === 0 ? "danger" : "uncommon";
    const note =
      tier === "safe"
        ? "Near settlement or post — green zone (PHB travel: safer)."
        : tier === "uncommon"
          ? "Yellow: ~1 in 6 encounter / 30 min march (DM rolls)."
          : "Red: ~1 in 4 / 15 min — dangerous road.";
    encounterZones.push({ x: r.x, y: r.y, w: r.w, h: r.h, tier, note });
    zi++;
  }

  const chokepoints: { x: number; y: number }[] = [];
  for (const c of roadCells) {
    let wallN = 0;
    let roadN = 0;
    for (const [dy, dx] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as const) {
      const t = grid[c.y + dy]?.[c.x + dx];
      if (t === T.W) wallN++;
      if (t === T.ROAD) roadN++;
    }
    /** Cliffs / rock pinch, junctions, bends, or dead-end stubs — ambush-prone (open fields use graph shape, not wall boxes). */
    const pinch = wallN >= 2 || (variant === "mountain_pass" && wallN >= 1);
    const graphAmbush = roadN !== 2 && roadN > 0;
    if (pinch || graphAmbush) chokepoints.push(c);
  }
  const sh = [...chokepoints].sort(() => rng() - 0.5);
  for (let i = 0; i < Math.min(3, sh.length); i++) {
    const p = sh[i]!;
    entities.push({
      type: "dm_marker",
      name: "Ambush site",
      glyph: "\u{1F441}",
      x: p.x,
      y: p.y,
      roomId: null,
      tooltip:
        "Choke point — half-cover from flanking terrain. Attackers may have Advantage on Stealth before the party closes. Click: consider an ambush encounter.",
    });
  }

  let mx = Math.floor(W / 2);
  let my = Math.floor(H / 2);
  if (roadCells.length) {
    const mid = roadCells[Math.floor(roadCells.length / 2)]!;
    mx = mid.x;
    my = mid.y;
  }
  type RiverCrossing = NonNullable<NonNullable<ForgeBiomeSession["road"]>["riverCrossing"]>;
  let riverCrossing: RiverCrossing | undefined = undefined;
  if (rng() < 0.6) {
    const ford = rng() < 0.45;
    if (ford) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = mx + dx;
        if (xx > 0 && xx < W - 1 && grid[my][xx] === T.ROAD) grid[my][xx] = T.WA;
      }
      riverCrossing = {
        x: mx,
        y: my,
        kind: "ford",
        note: "Ford (stream): DC 10 Athletics vs current; possible ambush / toll point.",
      };
    } else {
      for (let dx = -1; dx <= 0; dx++) {
        const xx = mx + dx;
        if (xx > 0 && xx < W - 1 && grid[my][xx] === T.ROAD) grid[my][xx] = T.BRIDGE;
      }
      decoOverlay.push({
        x: mx - 2,
        y: my,
        ch: "\u2299",
        fg: "#8a6040",
        name: "Bridge trolley",
        decoKey: "bridge_trolley",
        roomId: null,
      });
      decoOverlay.push({
        x: mx + 2,
        y: my,
        ch: "\u2299",
        fg: "#8a6040",
        name: "Bridge trolley",
        decoKey: "bridge_trolley",
        roomId: null,
      });
      riverCrossing = { x: mx, y: my, kind: "bridge", note: "Bridge crossing — toll or ambush hotspot (DM)." };
    }
  }

  let gx = 4;
  for (let step = 0; step < 5; step++) {
    const rx = gx + step * 6;
    if (rx >= W - 4) break;
    const rc = roadCells.find((c) => Math.abs(c.x - rx) < 4) ?? roadCells[step % roadCells.length];
    if (!rc) break;
    const kinds = ["milestone", "shrine", "inn", "guard"] as const;
    const k = kinds[step % 4];
    if (k === "milestone")
      decoOverlay.push({
        x: rc.x,
        y: rc.y - 1,
        ch: "\u25C6",
        fg: "#8899aa",
        name: "Milestone",
        decoKey: "milestone",
        purpose: "Carved stone — distance to nearest town (click to name towns).",
        roomId: null,
      });
    else if (k === "shrine")
      decoOverlay.push({
        x: rc.x,
        y: rc.y - 1,
        ch: "\u262F",
        fg: "#aac",
        name: "Wayside shrine",
        decoKey: "wayside_shrine",
        purpose: "DC 5 Religion — inspiration at DM’s discretion.",
        roomId: null,
      });
    else if (k === "inn")
      entities.push({
        type: "monster",
        name: "Innkeeper",
        x: rc.x,
        y: rc.y,
        count: 1,
        cr: 0,
        roomId: null,
        slug: "commoner",
        notes: "Roadside inn — stable, bar, 2 rooms (narrative).",
      });
    else
      entities.push({
        type: "monster",
        name: "Guard",
        x: rc.x,
        y: rc.y,
        count: 2,
        cr: 0.125,
        roomId: null,
        slug: "guard",
        notes: "Watch post — 2 guards on duty.",
      });
  }

  const flankDensity = variant === "dirt_trail" ? 0.4 : variant === "kings_highway" ? 0.2 : 0.15;
  for (const c of roadCells) {
    for (const [dy, dx] of [
      [-1, 0],
      [1, 0],
    ] as const) {
      const nx = c.x + dx;
      const ny = c.y + dy;
      if (ny < 1 || ny >= H - 1 || nx < 1 || nx >= W - 1) continue;
      if (grid[ny][nx] !== T.F) continue;
      if (rng() > flankDensity) continue;
      if (variant === "mountain_pass") {
        grid[ny][nx] = T.W;
        continue;
      }
      const tree = variant === "kings_highway" && rng() < 0.5;
      decoOverlay.push({
        x: nx,
        y: ny,
        ch: tree ? "\u2660" : "\u25C9",
        fg: tree ? "#2a6a2a" : "#6a6a70",
        name: tree ? "Tree" : "Boulder",
        decoKey: tree ? "road_tree" : "road_boulder",
        roomId: null,
      });
    }
  }

  for (let o = 0; o < rI(1, 2, rng); o++) {
    const c = pick(roadCells, rng);
    entities.push({
      type: "trap",
      name: o === 0 ? "Fallen tree" : "Rock slide",
      x: c.x,
      y: c.y,
      roomId: null,
      detectDC: 12,
      saveDC: o === 0 ? 12 : 12,
      saveType: o === 0 ? "STR" : "DEX",
      dmg: o === 0 ? "blocked path — DC 12 Athletics to clear" : "difficult terrain + DC 12 DEX or 1d6 bludgeoning",
    });
  }

  if (sh.length && rng() < 0.85) {
    const branch = sh[0]!;
    for (let s = 1; s <= rI(6, 8, rng); s++) {
      const bx = clamp(branch.x - s, 2, W - 3);
      const by = clamp(branch.y + (rng() < 0.5 ? -1 : 1), 2, H - 3);
      const t0 = grid[by][bx];
      if (t0 === T.F || t0 === T.V || t0 === T.W) grid[by][bx] = T.ROAD;
    }
    const clearX = clamp(branch.x - 4, 3, W - 6);
    const clearY = clamp(branch.y, 3, H - 6);
    for (let yy = clearY; yy < clearY + 4; yy++)
      for (let xx = clearX; xx < clearX + 3; xx++) if (grid[yy]?.[xx] === T.ROAD || grid[yy]?.[xx] === T.F) grid[yy][xx] = T.F;
    decoOverlay.push({
      x: clearX + 1,
      y: clearY + 1,
      ch: "\u2668",
      fg: "#f80",
      name: "Campfire",
      decoKey: "bandit_campfire",
      roomId: null,
    });
    entities.push(
      { type: "monster", name: "Bandit", x: clearX, y: clearY, count: rI(3, 6, rng), cr: 0.125, roomId: null, slug: "bandit" },
    );
    decoOverlay.push({
      x: clearX + 2,
      y: clearY,
      ch: "\u203D",
      fg: "#c9a",
      name: "Wanted poster",
      decoKey: "wanted_poster",
      roomId: null,
    });
  }

  return {
    variant,
    travelTiles,
    travelFeet,
    paceHours,
    encounterZones,
    riverCrossing,
    banditCamp: sh.length ? { x: sh[0]!.x - 3, y: sh[0]!.y, note: "Side path to bandit clearing — 2d10 gp + stolen goods." } : undefined,
  };
}

export function postProcessVolcanicLair(
  grid: number[][],
  rooms: Array<{ id: number; x: number; y: number; w: number; h: number; cx: number; cy: number }>,
  entities: EntityRec[],
  decoOverlay: DecoRec[],
  rng: () => number,
  tremor: "dormant" | "active" | "erupting",
  eruptionRounds: number,
): ForgeBiomeSession["volcanic"] {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  let lavaRiverCells = 0;
  const heatRule =
    "After 1 h in extreme heat: CON DC 10 or +1 exhaustion (cold resist / Endure Elements negates). Panel timer every 10 min.";
  if (rooms.length < 1) {
    return {
      lavaRiverCells: 0,
      geysers: [],
      obsidianPillars: [],
      tremor,
      eruptionRounds,
      heatRule,
    };
  }
  if (rooms.length >= 2) {
    const a = rooms[0]!;
    const b = rooms.reduce((best, r) => (r.w * r.h > best.w * best.h ? r : best), rooms[0]!);
    let x = a.cx;
    let y = a.cy;
    const tx = b.cx;
    const ty = b.cy;
    for (let s = 0; s < W + H; s++) {
      if (Math.abs(x - tx) + Math.abs(y - ty) <= 2) break;
      if (x < tx) x++;
      else if (x > tx) x--;
      else if (y < ty) y++;
      else y--;
      if (y > 0 && y < H - 1 && x > 0 && x < W - 1) {
        if (grid[y][x] === T.C || grid[y][x] === T.F) {
          grid[y][x] = T.LAVA;
          lavaRiverCells++;
        }
      }
    }
  }

  const large = rooms.filter((r) => r.w * r.h > 36);
  for (const r of large) {
    const px = r.x + 2;
    const py = r.y + 2;
    if (grid[py]?.[px] === T.F) {
      decoOverlay.push({
        x: px,
        y: py,
        ch: "\u2588",
        fg: "#0a0a12",
        name: "Obsidian pillar",
        decoKey: "obsidian_pillar",
        purpose: "Razor obsidian — forced movement through the pillar: 1d4 slashing.",
        roomId: r.id,
      });
    }
  }

  const geysers: { x: number; y: number; note: string }[] = [];
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (grid[y][x] !== T.F) continue;
      const nearLava = [grid[y - 1]?.[x], grid[y + 1]?.[x], grid[y]?.[x - 1], grid[y]?.[x + 1]].some((t) => t === T.LAVA);
      if (nearLava && rng() < 0.06 && geysers.length < 5) {
        entities.push({
          type: "trap",
          name: "Fire geyser",
          x,
          y,
          roomId: null,
          detectDC: 14,
          saveType: "DEX",
          saveDC: 14,
          dmg: "3d8 fire + push 5 ft",
        });
        decoOverlay.push({ x, y, ch: "\u21D1", fg: "#f60", name: "Geyser crack", decoKey: "fire_geyser", roomId: null });
        geysers.push({ x, y, note: "Triggers every 1d4 rounds — DM “Activate geyser”." });
      }
    }

  const boss = rooms.reduce((best, r) => (r.w * r.h > best.w * best.h ? r : best), rooms[0]!);
  let forgeRoomId: number | undefined;
  let salamanderRoomId: number | undefined;
  let cooledTreasureRoomId: number | undefined;
  if (boss) {
    forgeRoomId = boss.id;
    const fx = boss.x + Math.floor(boss.w / 2);
    const fy = boss.y + Math.floor(boss.h / 2);
    decoOverlay.push({
      x: fx,
      y: fy,
      ch: "F",
      fg: "#f80",
      name: "Forge",
      decoKey: "volc_forge",
      purpose: "Massive anvil — 8 h crafting fire‑attuned gear (DM).",
      roomId: boss.id,
    });
    entities.push({
      type: "item",
      name: "Metal rack (ingots 1d4 mithral/adamantine)",
      x: fx + 1,
      y: fy,
      r: "rare",
      roomId: boss.id,
    });
    const pool = rooms.find((r) => r.id !== boss.id && r.w * r.h > 30);
    if (pool) {
      salamanderRoomId = pool.id;
      for (let yy = pool.y + 1; yy < pool.y + pool.h - 1; yy++)
        for (let xx = pool.x + 1; xx < pool.x + pool.w - 1; xx++) if (rng() < 0.35) grid[yy][xx] = T.LAVA;
      entities.push({
        type: "monster",
        name: "Salamander",
        x: pool.cx,
        y: pool.cy,
        count: rI(3, 4, rng),
        cr: 5,
        roomId: pool.id,
        slug: "salamander",
      });
    }
    cooledTreasureRoomId = boss.id;
    const tx = boss.x + 1;
    const ty = boss.y + 1;
    if (grid[ty]?.[tx] === T.F) {
      decoOverlay.push({
        x: tx,
        y: ty,
        ch: "\u2248",
        fg: "#6a6a6a",
        name: "Cooled lava (treasure)",
        decoKey: "cooled_lava_loot",
        purpose: "Loot under rock — pick 1 h or Disintegrate; scaled hoard.",
        roomId: boss.id,
      });
    }
    entities.push({
      type: "dm_marker",
      name: "Hanging cage",
      glyph: "\u26BF",
      x: boss.cx,
      y: boss.y + 1,
      roomId: boss.id,
      tooltip: "Chain AC 19 HP 5 — destroy drops cage into lava (10d10 fire). Winch in adjacent hall.",
    });
  }

  return {
    lavaRiverCells,
    forgeRoomId,
    salamanderRoomId,
    cooledTreasureRoomId,
    hangingCage: boss
      ? { x: boss.cx, y: boss.y + 1, note: "Prisoner cage over lava — dramatic set piece." }
      : undefined,
    geysers,
    obsidianPillars: large.map((r) => ({ x: r.x + 2, y: r.y + 2, note: "Obsidian pillar — cover + slashing hazard." })),
    tremor,
    eruptionRounds,
    heatRule,
  };
}

export function postProcessFeyForest(
  grid: number[][],
  rooms: Array<{ id: number; x: number; y: number; w: number; h: number; cx: number; cy: number }>,
  entities: EntityRec[],
  decoOverlay: DecoRec[],
  rng: () => number,
): ForgeBiomeSession["fey"] {
  const H = grid.length;
  const W = grid[0]?.length ?? 0;
  if (!rooms.length) {
    return {
      shiftingPathsNote: "Shifting paths: reroll corridors on long rest (DM).",
      ancientTrees: 0,
      illusoryCells: [],
      thornRooms: [],
    };
  }
  const open = [...rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0];
  let feyCircle: { x: number; y: number; note: string } | undefined;
  if (open) {
    const ox = open.cx;
    const oy = open.cy;
    const ring = [
      [0, 2],
      [1, 1],
      [2, 0],
      [2, -1],
      [1, -2],
      [0, -2],
      [-1, -1],
      [-2, 0],
    ] as const;
    let i = 0;
    for (const [dx, dy] of ring) {
      const xx = ox + dx;
      const yy = oy + dy;
      if (yy > 0 && yy < H - 1 && xx > 0 && xx < W - 1 && grid[yy][xx] === T.F) {
        decoOverlay.push({
          x: xx,
          y: yy,
          ch: i % 2 === 0 ? "\u273F" : "o",
          fg: "#6aeca8",
          name: "Fey circle",
          decoKey: "fey_circle_mushroom",
          roomId: open.id,
        });
        i++;
      }
    }
    feyCircle = {
      x: ox,
      y: oy,
      note: "DC 15 WIS on entry or Feywild jaunt 1d4 h. Close: DC 20 Arcana or Dispel.",
    };
  }

  let placed = 0;
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      if (grid[y][x] !== T.F) continue;
      if (rng() < 0.03 && placed < 12) {
        decoOverlay.push({
          x,
          y,
          ch: "\u2660\u2660",
          fg: "#0a6a4a",
          name: "Ancient tree",
          decoKey: "ancient_tree",
          purpose: "Speak with Plants — DC 12 History question.",
          roomId: null,
        });
        placed++;
      }
    }

  const deep = rooms.length ? [...rooms].sort((a, b) => b.w * b.h - a.w * a.h)[0] : undefined;
  let archfeyCourtRoomId: number | undefined;
  if (deep && deep.w >= 6 && deep.h >= 6) {
    archfeyCourtRoomId = deep.id;
    decoOverlay.push({
      x: deep.cx,
      y: deep.y + 1,
      ch: "\u2655",
      fg: "#e8c048",
      name: "Archfey throne",
      decoKey: "archfey_throne",
      roomId: deep.id,
    });
    entities.push(
      { type: "monster", name: "Dryad", x: deep.x + 2, y: deep.cy, count: 2, cr: 1, roomId: deep.id, slug: "dryad" },
      {
        type: "monster",
        name: "Archfey",
        x: deep.cx,
        y: deep.cy,
        count: 1,
        cr: 12,
        roomId: deep.id,
        slug: "archmage",
        notes: "Quest bargain — Geas if accepted (DM).",
      },
    );
  }

  const td = rooms[rI(0, rooms.length - 1, rng)]!;
  const timeDilationRoomId = td?.id;
  if (td)
    decoOverlay.push({
      x: td.cx,
      y: td.cy,
      ch: "\u231B",
      fg: "#8cf",
      name: "Time dilates",
      decoKey: "time_dilation",
      purpose: "1 turn here = 1 h outside; rests age oddly (DM).",
      roomId: td.id,
    });

  const illusory: { x: number; y: number }[] = [];
  for (const r of rooms) {
    if (rng() > 0.4 || illusory.length >= 2) continue;
    const x = r.x + r.w - 1;
    const y = r.cy;
    if (y > 0 && y < H - 1 && x > 0 && x < W - 1 && grid[y][x] === T.W) {
      grid[y][x] = T.SECRET_DOOR;
      illusory.push({ x, y });
      decoOverlay.push({
        x,
        y,
        ch: "?",
        fg: "#9cf",
        name: "Illusory wall",
        decoKey: "illusory_wall_dm",
        purpose: "DC 13 Investigation — hidden passage to fey loot.",
        roomId: r.id,
      });
    }
  }

  const glamourRoom = rooms.length ? pick(rooms, rng) : undefined;
  let glamourChestRoomId: number | undefined;
  if (glamourRoom) {
    glamourChestRoomId = glamourRoom.id;
    decoOverlay.push({
      x: glamourRoom.cx,
      y: glamourRoom.cy,
      ch: "\u2728",
      fg: "#eaf",
      name: "Glamour chest (mimic?)",
      decoKey: "glamour_chest_dm",
      purpose: "DC 14 Insight before opening; may be mimic (DM).",
      roomId: glamourRoom.id,
    });
  }

  for (const r of rooms) {
    if (r.w * r.h < 40) continue;
    for (let k = 0; k < rI(2, 4, rng); k++)
      entities.push({
        type: "monster",
        name: rng() < 0.5 ? "Sprite" : "Pixie",
        x: r.x + rI(1, r.w - 2, rng),
        y: r.y + rI(1, r.h - 2, rng),
        count: 1,
        cr: 0.25,
        roomId: r.id,
        slug: "sprite",
        notes: "May guide for a secret — DC 10 Stealth to hide in flowers.",
      });
  }

  for (let w = 0; w < rI(3, 5, rng); w++) {
    const x = rI(2, W - 3, rng);
    const y = rI(2, H - 3, rng);
    if (grid[y][x] !== T.F) continue;
    decoOverlay.push({
      x,
      y,
      ch: "\u2726",
      fg: "#9fd",
      name: "Wisp light",
      decoKey: "wisp_light",
      roomId: null,
    });
  }

  return {
    feyCircle,
    archfeyCourtRoomId,
    timeDilationRoomId,
    illusoryCells: illusory,
    shiftingPathsNote: "Toggle “Shifting paths”: on long rest, 1–2 corridor links reroll (DM). Forest rewrites trails.",
    glamourChestRoomId,
    ancientTrees: placed,
    thornRooms: rooms.filter((r) => r.w >= 5).map((r) => r.id),
  };
}
