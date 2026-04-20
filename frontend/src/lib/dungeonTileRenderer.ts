/**
 * Canvas pixel-art tile renderer for Dungeon Forge.
 * Tile type constants MUST match `DUNGEON_T` in dungeonForgeConstants.ts.
 */

import type { BattleToken, SceneLight } from "@/lib/playerMapBroadcast";
import {
  cellBlocksLightPropagation,
  collectTorchFixtureLights,
  computeOccludedLightDarkness,
} from "@/lib/dungeonLightOcclusion";
import { monsterTokenSpriteWithFallback, publicAssetUrl } from "@/lib/tokenSprites";

export type TilePalette = {
  void: string;
  wallBg: string;
  wallFg: string;
  wallShadow: string;
  floorBg: string;
  floorDetail: string;
  doorBg: string;
  doorFg: string;
  doorAccent: string;
  corridorBg: string;
  corridorFg: string;
  waterBg: string;
  waterWave: string;
  stairsBg: string;
  stairsFg: string;
  pillarBg: string;
  pillarFg: string;
  pillarShadow: string;
  roadBg: string;
  roadLine: string;
  /** Plank / span over water (defaults to corridor tones if omitted). */
  bridgeBg?: string;
  bridgeFg?: string;
  /** Molten hazard (defaults to water tones if omitted). */
  lavaBg?: string;
  lavaGlow?: string;
};

export type EntityPalette = {
  monster: string;
  trap: string;
  item: string;
  riddle: string;
  label: string;
  deco: string;
  theme: string;
};

export type RenderTileOpts = {
  palette: TilePalette;
  entities: EntityPalette;
  cellPx: number;
  dpr: number;
  /** Fog of war: if set, cells not in the set are drawn as void (player view). */
  fogCells?: Set<string> | null;
  /** DM view shows monsters/traps/items; player hides them on the map. */
  showEnts?: boolean;
  /** Player export: hide room numbers and sensitive decos. */
  playerSanitize?: boolean;
  hideDecoKeys?: Set<string>;
  /** Semi-transparent highlight for selected room bounds (grid coords). */
  highlightRoom?: { x: number; y: number; w: number; h: number } | null;
  inkSaver?: boolean;
  /** Grid keys `"x,y"` for doors that are open. Omitted / empty = all doors open for drawing (legacy). */
  doorOpen?: Set<string> | null;
  /** Optional explicit door machine: `"open" | "closed" | "locked"` per key; overrides `doorOpen` when set. */
  doorStates?: Record<string, string> | null;
  /** 0–1 animation phase for water/lava shimmer. */
  animPhase?: number;
  /** Simple radial dimming from a grid cell (player lantern / torch). */
  lighting?: { gx: number; gy: number; radiusCells: number; intensity?: number } | null;
  /** Multiple torches / sconces; combines with max brightness (see render loop). */
  sceneLights?: SceneLight[] | null;
  /** DM-only: boss room frame, corridor distance labels, throne marker. */
  forgeDmHints?: {
    bossRoom?: { x: number; y: number; w: number; h: number };
    corridorLabels?: { x: number; y: number; text: string }[];
    throneCx?: number;
    throneCy?: number;
    graveyardGate?: { gx: number; gy: number; label?: string };
    streetLabels?: { x: number; y: number; text: string; rot?: number }[];
    patrolPaths?: { points: { x: number; y: number }[]; label?: string }[];
    escapeTunnel?: { points: { x: number; y: number }[] };
    chaseSegments?: { x: number; y: number; ft: number }[];
    consecratedCells?: { x: number; y: number; k: "consecrated" | "desecrated" }[];
    fortifiedDmNote?: string;
    townLayoutDmNote?: string;
    /** Road wilderness: PHB-style encounter frequency bands (DM overlay). */
    roadEncounterZones?: { x: number; y: number; w: number; h: number; tier: "safe" | "uncommon" | "danger"; note?: string }[];
  } | null;
  /** Graveyard night / dusk / weather — extra darkness or rain drawn in post-pass (DM map). */
  graveyardAmbience?: { timeOfDay?: "day" | "dusk" | "night"; weather?: "clear" | "rain" | "heavy_rain" };
  /** Lit dungeons add sconce lights in the renderer; dark suppresses ambient. */
  dungeonLighting?: "lit" | "dim" | "dark";
  /** Corner / wall-adjacent floor darkening (Phase 2-D). */
  aoPass?: boolean;
  /** Extruded wall “cubes” south/east (Phase 3-B). */
  depthPass?: boolean;
  /** Full-map vignette (Phase 3-C). */
  vignettePass?: boolean;
  /** Distance-based extra dimming (Phase 3-C). */
  depthFog?: boolean;
  /** Procedural floor/wall micro detail (Phase 3-A). */
  tileDetailStyle?: "dungeon" | "cave" | "temple" | null;
  /** DM / player battle pips (drawn above terrain; respect fog when `fogCells` set). Token coords match the `grid` passed in (local if cropped). */
  battleTokens?: BattleToken[] | null;
  /** Loaded images for `BattleToken.portraitUrl` / `spriteUrl` (keyed by URL). */
  tokenImages?: Map<string, HTMLImageElement> | null;
  /** Loaded monster SVGs for scripted map entities (`cell.eType === "monster"` + `slug`), keyed like `tokenImages`. */
  entityTokenImages?: Map<string, HTMLImageElement> | null;
  /**
   * Draw a sight ring (grid radius) around **player** tokens instead of relying on volumetric lights.
   * Used on DM + player TV for performance.
   */
  playerSightRingCells?: number | null;
};

export type RenderCell = {
  ch: string;
  tile: number;
  eType: string | null;
  fg: string | null;
  eName: string | null;
  extra: unknown;
};

const T_VOID = 0;
const T_FLOOR = 1;
const T_WALL = 2;
const T_DOOR = 3;
const T_CORRIDOR = 4;
const T_STAIRS_DOWN = 5;
const T_STAIRS_UP = 6;
const T_WATER = 7;
const T_PILLAR = 8;
const T_ROAD = 9;
const T_BRIDGE = 10;
const T_LAVA = 11;
const T_SECRET_DOOR = 12;
const T_PIT = 13;
const T_GATE = 14;
const T_DRAWBRIDGE = 15;
const T_HEADSTONE = 16;
const T_ARROW_SLIT = 17;
const T_MURDER_HOLE = 18;
const T_CELL_BARS = 19;
const T_ALLEY = 20;

/** Wall sconce lights along corridors for lit dungeons (~30 ft / 6 tiles). */
function collectDungeonLitSconces(grid: RenderCell[][], cols: number, rows: number): SceneLight[] {
  const out: SceneLight[] = [];
  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const c = grid[y]![x]!;
      if (c.tile !== T_CORRIDOR) continue;
      if ((x + y) % 6 !== 0) continue;
      const n = [grid[y - 1]?.[x]?.tile, grid[y + 1]?.[x]?.tile, grid[y]?.[x - 1]?.tile, grid[y]?.[x + 1]?.tile];
      if (!n.some((t) => t === T_WALL || t === T_DOOR || t === T_SECRET_DOOR || t === T_GATE || t === T_DRAWBRIDGE))
        continue;
      out.push({ gx: x, gy: y, radiusCells: 5, intensity: 0.14, kind: "torch" });
    }
  }
  return out;
}

function isDoorOpenForRender(
  dk: string | null,
  doorOpen: Set<string> | null | undefined,
  doorStates: Record<string, string> | null | undefined,
): boolean {
  if (!dk) return true;
  if (doorStates && Object.prototype.hasOwnProperty.call(doorStates, dk)) {
    return doorStates[dk] === "open";
  }
  if (doorOpen == null) return true;
  return doorOpen.has(dk);
}

function hexToGray(hex: string): string {
  if (typeof hex !== "string" || !hex.startsWith("#")) return hex;
  let h = hex.slice(1);
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const y = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const v = Math.min(255, Math.max(0, y));
  const t = v.toString(16).padStart(2, "0");
  return `#${t}${t}${t}`;
}

function grayPalette(p: TilePalette): TilePalette {
  const o = {} as Record<keyof TilePalette, string>;
  (Object.keys(p) as (keyof TilePalette)[]).forEach((k) => {
    const v = p[k];
    if (v === undefined) return;
    o[k] = hexToGray(v);
  });
  return o as TilePalette;
}

function grayEntityPalette(e: EntityPalette): EntityPalette {
  const o = {} as Record<keyof EntityPalette, string>;
  (Object.keys(e) as (keyof EntityPalette)[]).forEach((k) => {
    o[k] = hexToGray(e[k]);
  });
  return o as EntityPalette;
}

function isFloorLikeTile(t: number): boolean {
  return (
    t === T_FLOOR ||
    t === T_CORRIDOR ||
    t === T_ROAD ||
    t === T_BRIDGE ||
    t === T_ALLEY ||
    t === T_STAIRS_UP ||
    t === T_STAIRS_DOWN
  );
}

function lightKindHex(kind: SceneLight["kind"] | undefined, custom?: string): string {
  if (custom && typeof custom === "string" && custom.startsWith("#")) return custom;
  switch (kind) {
    case "lantern":
      return "#ffe0a0";
    case "magic":
      return "#a060ff";
    case "fire":
      return "#ff4400";
    case "cold":
      return "#80c0ff";
    case "necrotic":
      return "#40ff80";
    case "divine":
      return "#ffffc0";
    case "fey":
      return "#40ffcc";
    case "lava":
      return "#ff2200";
    case "wisp":
      return "#c0ffff";
    case "token":
      return "#ffb060";
    case "room":
      return "#f0e8d8";
    case "torch":
    default:
      return "#ff9040";
  }
}

function dominantLightAtCell(
  gx: number,
  gy: number,
  lights: SceneLight[],
  doorOpen: Set<string> | null | undefined,
  doorStates: Record<string, string> | null | undefined,
  grid: RenderCell[][],
): SceneLight | null {
  if (!grid.length || !grid[0]?.length) return null;
  let best: SceneLight | null = null;
  let bestD = 1e9;
  for (const L of lights) {
    const lx = Math.floor(L.gx);
    const ly = Math.floor(L.gy);
    if (lx < 0 || ly < 0 || ly >= grid.length || lx >= grid[0].length) continue;
    if (cellBlocksLightPropagation(grid[ly]![lx]!, lx, ly, doorOpen, doorStates)) continue;
    const d = Math.hypot(gx - L.gx, gy - L.gy);
    const r = Math.max(0.5, L.radiusCells || 4);
    if (d <= r && d < bestD) {
      best = L;
      bestD = d;
    }
  }
  return best;
}

function applyFloorWallMicroDetail(
  ctx: CanvasRenderingContext2D,
  cell: RenderCell,
  px: number,
  py: number,
  s: number,
  gx: number,
  gy: number,
  style: "dungeon" | "cave" | "temple" | null,
): void {
  if (!style) return;
  const t = cell.tile;
  if (t === T_FLOOR || t === T_CORRIDOR) {
    if (style === "dungeon" && (gx + gy) % 4 === 0) {
      ctx.fillStyle = "rgba(0,0,0,0.2)";
      ctx.fillRect(px, py + s - 1, s, 1);
      ctx.fillRect(px + s - 1, py, 1, s);
    }
    if (style === "cave") {
      const seed = gx * 131 + gy * 173;
      for (let i = 0; i < 4; i++) {
        const ox = 1 + ((seed >> (i * 4)) % Math.max(1, s - 2));
        const oy = 1 + ((seed >> (i * 4 + 2)) % Math.max(1, s - 2));
        ctx.fillStyle = "rgba(0,0,0,0.28)";
        ctx.fillRect(px + ox, py + oy, 1, 1);
      }
    }
    if (style === "temple") {
      const alt = (gx + gy) % 2 === 0;
      ctx.fillStyle = alt ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
      ctx.fillRect(px + Math.floor(s * 0.2), py + Math.floor(s * 0.2), Math.floor(s * 0.6), Math.floor(s * 0.6));
    }
  }
  if (t === T_WALL && style === "dungeon") {
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    const by = py + Math.floor(s * 0.42);
    ctx.fillRect(px + 1, by, s - 2, 1);
  }
}

/**
 * Draws the dungeon grid onto `canvas` using pixel-art tiles.
 */
export function renderDungeonToCanvas(canvas: HTMLCanvasElement, grid: RenderCell[][], opts: RenderTileOpts): void {
  let palette = opts.palette;
  let entities = opts.entities;
  if (opts.inkSaver) {
    palette = grayPalette(palette);
    entities = grayEntityPalette(entities);
  }

  const { cellPx, dpr } = opts;
  const rows = grid.length;
  const cols = rows > 0 ? grid[0].length : 0;
  const cssW = cols * cellPx;
  const cssH = rows * cellPx;

  const nextW = Math.ceil(cssW * dpr);
  const nextH = Math.ceil(cssH * dpr);
  if (canvas.width !== nextW || canvas.height !== nextH) {
    canvas.width = nextW;
    canvas.height = nextH;
  }
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;

  ctx.fillStyle = palette.void;
  ctx.fillRect(0, 0, cssW, cssH);

  const showEnts = opts.showEnts !== false;
  const fog = opts.fogCells;
  const sanitize = !!opts.playerSanitize;
  const hideDeco = opts.hideDecoKeys ?? new Set<string>();
  const hi = opts.highlightRoom;
  const animPhase = opts.animPhase ?? 0;
  const doorStates = opts.doorStates ?? null;
  const sceneLights: SceneLight[] = (() => {
    if (opts.sceneLights?.length) return opts.sceneLights;
    const L = opts.lighting;
    if (L) return [{ gx: L.gx, gy: L.gy, radiusCells: L.radiusCells, intensity: L.intensity }];
    return [];
  })();

  const fixtureTorchLights = collectTorchFixtureLights(grid, cols, rows);
  const litSconces =
    opts.dungeonLighting === "lit"
      ? collectDungeonLitSconces(grid, cols, rows)
      : [];
  const mergedLights: SceneLight[] = [...sceneLights, ...fixtureTorchLights, ...litSconces];
  const lightDarkBuf =
    mergedLights.length > 0
      ? computeOccludedLightDarkness(grid, cols, rows, mergedLights, {
          doorOpen: opts.doorOpen ?? null,
          doorStates: opts.doorStates ?? null,
          animPhase,
        })
      : null;

  const tdStyle = opts.tileDetailStyle ?? null;
  const aoPass = !!opts.aoPass;
  const depthPass = !!opts.depthPass;
  const vignettePass = !!opts.vignettePass;
  const depthFog = !!opts.depthFog;
  const ink = !!opts.inkSaver;
  const doorOpenSet = opts.doorOpen ?? null;

  const paintCell = (x: number, y: number): void => {
    const px = x * cellPx;
    const py = y * cellPx;
    if (fog && !fog.has(`${x},${y}`)) {
      ctx.fillStyle = palette.void;
      ctx.fillRect(px, py, cellPx, cellPx);
      return;
    }
    const cell = grid[y][x];
    drawBaseTile(
      ctx,
      cell,
      px,
      py,
      cellPx,
      palette,
      grid,
      x,
      y,
      cols,
      rows,
      showEnts,
      sanitize,
      hideDeco,
      doorOpenSet,
      doorStates,
      animPhase,
    );
    applyFloorWallMicroDetail(ctx, cell, px, py, cellPx, x, y, tdStyle);
    if (hi && x >= hi.x && x < hi.x + hi.w && y >= hi.y && y < hi.y + hi.h) {
      ctx.fillStyle = "rgba(255,220,50,0.18)";
      ctx.fillRect(px, py, cellPx, cellPx);
    }
  };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      paintCell(x, y);
    }
  }

  if (aoPass && !ink) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (fog && !fog.has(`${x},${y}`)) continue;
        const cell = grid[y][x];
        const t = cell.tile;
        if (!isFloorLikeTile(t)) continue;
        let wallCount = 0;
        let diagWall = 0;
        const card = [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ] as const;
        for (const [dx, dy] of card) {
          const nx = x + dx;
          const ny = y + dy;
          const nt = grid[ny]?.[nx]?.tile ?? T_VOID;
          if (nt === T_WALL || nt === T_VOID || nt === T_PILLAR) wallCount++;
        }
        const diag = [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ] as const;
        for (const [dx, dy] of diag) {
          const nt = grid[y + dy]?.[x + dx]?.tile ?? T_VOID;
          if (nt === T_WALL || nt === T_VOID || nt === T_PILLAR) diagWall++;
        }
        let ao = wallCount * 0.08 + diagWall * 0.04;
        ao = Math.min(0.32, ao);
        if (ao < 0.001) continue;
        const px = x * cellPx;
        const py = y * cellPx;
        ctx.fillStyle = `rgba(0,0,0,${ao})`;
        ctx.fillRect(px, py, cellPx, cellPx);
      }
    }
  }

  if (depthPass && !ink) {
    const faceWall = 0.5;
    const facePillar = 0.38;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (fog && !fog.has(`${x},${y}`)) continue;
        const t = grid[y][x].tile;
        if (t !== T_WALL && t !== T_PILLAR) continue;
        const s = cellPx;
        const px = x * s;
        const py = y * s;
        const a = t === T_PILLAR ? facePillar : faceWall;
        if (y + 1 < rows && isFloorLikeTile(grid[y + 1][x].tile)) {
          const pyS = (y + 1) * s;
          ctx.fillStyle = `rgba(0,0,0,${a})`;
          ctx.fillRect(px, pyS, s, Math.max(3, Math.floor(s * 0.14)));
        }
        if (x + 1 < cols && isFloorLikeTile(grid[y][x + 1].tile)) {
          const pxE = (x + 1) * s;
          ctx.fillStyle = `rgba(0,0,0,${a * 0.88})`;
          ctx.fillRect(pxE, py, Math.max(3, Math.floor(s * 0.11)), s);
        }
      }
    }
  }

  if (!ink) {
    let shadowMul = 1;
    if (opts.dungeonLighting === "lit") shadowMul = 0.3;
    else if (opts.dungeonLighting === "dim") shadowMul = 0.6;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (fog && !fog.has(`${x},${y}`)) continue;
        const t = grid[y][x].tile;
        if (t !== T_WALL && t !== T_PILLAR && t !== T_DOOR) continue;
        const s = cellPx;
        const px = x * s;
        const py = y * s;
        if (y + 1 < rows) {
          const st = grid[y + 1][x].tile;
          if (isFloorLikeTile(st)) {
            const pyS = (y + 1) * s;
            ctx.fillStyle = `rgba(0,0,0,${0.45 * shadowMul})`;
            ctx.fillRect(px, pyS + s - Math.max(2, Math.floor(s * 0.08)), s, Math.max(2, Math.floor(s * 0.08)));
          }
        }
        if (x + 1 < cols) {
          const et = grid[y][x + 1].tile;
          if (isFloorLikeTile(et)) {
            const pxE = (x + 1) * s;
            ctx.fillStyle = `rgba(0,0,0,${0.35 * shadowMul})`;
            ctx.fillRect(pxE, py, Math.max(2, Math.floor(s * 0.06)), s);
          }
        }
        if (t === T_DOOR && y + 1 < rows && isFloorLikeTile(grid[y + 1][x].tile)) {
          const pyS = (y + 1) * s;
          ctx.fillStyle = `rgba(0,0,0,${0.22 * shadowMul})`;
          ctx.fillRect(px, pyS + s - 2, s, 2);
        }
      }
    }
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cellPx;
      const py = y * cellPx;
      if (fog && !fog.has(`${x},${y}`)) continue;
      const cell = grid[y][x];
      drawOverlays(
        ctx,
        cell,
        px,
        py,
        cellPx,
        palette,
        entities,
        showEnts,
        sanitize,
        hideDeco,
        animPhase,
        opts.entityTokenImages ?? null,
      );
    }
  }

  if (mergedLights.length > 0 && !ink) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (fog && !fog.has(`${x},${y}`)) continue;
        const px = x * cellPx;
        const py = y * cellPx;
        const L = dominantLightAtCell(x, y, mergedLights, doorOpenSet, doorStates, grid);
        if (!L) continue;
        const flick =
          L.flicker !== false && L.kind !== "divine" && L.kind !== "room"
            ? 1 + 0.05 * Math.sin(animPhase * Math.PI + x + y)
            : 1;
        const hex = lightKindHex(L.kind, L.color);
        const dark = lightDarkBuf ? lightDarkBuf[y * cols + x] ?? 0.5 : 0.25;
        const lit = Math.max(0, 1 - Math.min(1, dark / 0.48));
        const a = lit * 0.22 * flick;
        if (a < 0.02) continue;
        ctx.save();
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = hex;
        ctx.globalAlpha = Math.min(0.55, a);
        ctx.fillRect(px, py, cellPx, cellPx);
        ctx.restore();
      }
    }
  }

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const px = x * cellPx;
      const py = y * cellPx;
      if (fog && !fog.has(`${x},${y}`)) {
        ctx.fillStyle = palette.void;
        ctx.fillRect(px, py, cellPx, cellPx);
        continue;
      }
      if (lightDarkBuf) {
        let dark = lightDarkBuf[y * cols + x] ?? 0;
        if (opts.dungeonLighting === "dark") dark = Math.min(1, dark + 0.42);
        else if (opts.dungeonLighting === "dim") dark = Math.min(1, dark + 0.18);
        if (dark > 0.001) {
          ctx.fillStyle = `rgba(0,0,0,${dark})`;
          ctx.fillRect(px, py, cellPx, cellPx);
        }
      }
    }
  }

  const dmHints = opts.forgeDmHints;
  if (dmHints && opts.showEnts !== false && !opts.playerSanitize) {
    ctx.save();
    const s = cellPx;
    if (dmHints.bossRoom) {
      const br = dmHints.bossRoom;
      const px0 = br.x * s;
      const py0 = br.y * s;
      ctx.strokeStyle = "rgba(220, 55, 45, 0.92)";
      ctx.lineWidth = Math.max(2, s * 0.14);
      ctx.strokeRect(px0 - 1, py0 - 1, br.w * s + 2, br.h * s + 2);
      ctx.strokeStyle = "rgba(210, 170, 50, 0.88)";
      ctx.lineWidth = Math.max(1, s * 0.07);
      ctx.strokeRect(px0 + 2, py0 + 2, br.w * s - 4, br.h * s - 4);
    }
    if (dmHints.throneCx != null && dmHints.throneCy != null) {
      const tcx = dmHints.throneCx * s + s / 2;
      const tcy = dmHints.throneCy * s + s / 2;
      ctx.fillStyle = "rgba(255, 215, 80, 0.95)";
      ctx.font = `bold ${Math.max(11, s * 0.72)}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", tcx, tcy);
      ctx.font = `bold ${Math.max(7, s * 0.26)}px system-ui,sans-serif`;
      ctx.fillStyle = "rgba(255, 235, 210, 0.92)";
      ctx.fillText("BOSS ROOM", tcx, tcy - s * 0.65);
    }
    for (const cl of dmHints.corridorLabels ?? []) {
      ctx.font = `${Math.max(7, s * 0.2)}px monospace`;
      ctx.fillStyle = "rgba(210, 200, 185, 0.88)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`— ${cl.text} —`, cl.x * s + s / 2, cl.y * s + s / 2);
    }
    const gg = dmHints.graveyardGate;
    if (gg) {
      ctx.font = `bold ${Math.max(8, s * 0.22)}px monospace`;
      ctx.fillStyle = "rgba(255, 200, 120, 0.95)";
      ctx.textAlign = "center";
      ctx.fillText(gg.label ?? "→ ENTER", gg.gx * s + s / 2, (gg.gy - 0.85) * s);
    }
    for (const sl of dmHints.streetLabels ?? []) {
      ctx.save();
      ctx.translate(sl.x * s + s / 2, sl.y * s + s / 2);
      ctx.rotate(sl.rot ?? 0);
      ctx.font = `${Math.max(7, s * 0.18)}px system-ui,sans-serif`;
      ctx.fillStyle = "rgba(200, 190, 170, 0.85)";
      ctx.textAlign = "center";
      ctx.fillText(sl.text, 0, 0);
      ctx.restore();
    }
    ctx.strokeStyle = "rgba(220, 200, 160, 0.55)";
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = Math.max(1, s * 0.06);
    for (const pp of dmHints.patrolPaths ?? []) {
      const pts = pp.points;
      if (pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(pts[0]!.x * s + s / 2, pts[0]!.y * s + s / 2);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i]!.x * s + s / 2, pts[i]!.y * s + s / 2);
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const tun = dmHints.escapeTunnel;
    if (tun?.points && tun.points.length > 1) {
      ctx.strokeStyle = "rgba(180, 140, 220, 0.65)";
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(tun.points[0]!.x * s + s / 2, tun.points[0]!.y * s + s / 2);
      for (let i = 1; i < tun.points.length; i++) {
        ctx.lineTo(tun.points[i]!.x * s + s / 2, tun.points[i]!.y * s + s / 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const cs of dmHints.chaseSegments ?? []) {
      ctx.font = `${Math.max(6, s * 0.16)}px monospace`;
      ctx.fillStyle = "rgba(180, 220, 255, 0.75)";
      ctx.fillText(`${cs.ft}′`, cs.x * s + s / 2, cs.y * s + s / 2);
    }
    for (const cc of dmHints.consecratedCells ?? []) {
      ctx.strokeStyle =
        cc.k === "consecrated" ? "rgba(255, 215, 120, 0.55)" : "rgba(160, 40, 60, 0.55)";
      ctx.lineWidth = Math.max(1, s * 0.1);
      ctx.strokeRect(cc.x * s + 1, cc.y * s + 1, s - 2, s - 2);
    }
    for (const rz of dmHints.roadEncounterZones ?? []) {
      const fill =
        rz.tier === "safe"
          ? "rgba(0, 180, 80, 0.18)"
          : rz.tier === "danger"
            ? "rgba(220, 60, 40, 0.24)"
            : "rgba(220, 200, 0, 0.22)";
      ctx.fillStyle = fill;
      ctx.fillRect(rz.x * s, rz.y * s, rz.w * s, rz.h * s);
      ctx.strokeStyle =
        rz.tier === "safe"
          ? "rgba(0, 130, 70, 0.45)"
          : rz.tier === "danger"
            ? "rgba(180, 40, 30, 0.5)"
            : "rgba(180, 160, 0, 0.45)";
      ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.setLineDash([]);
      ctx.strokeRect(rz.x * s + 0.5, rz.y * s + 0.5, rz.w * s - 1, rz.h * s - 1);
    }
    ctx.restore();
  }

  const amb = opts.graveyardAmbience;
  if (amb && opts.showEnts !== false && !opts.playerSanitize) {
    ctx.save();
    const Wpx = cols * cellPx;
    const Hpx = rows * cellPx;
    if (amb.timeOfDay === "dusk") {
      ctx.fillStyle = "rgba(25, 20, 55, 0.22)";
      ctx.fillRect(0, 0, Wpx, Hpx);
    } else if (amb.timeOfDay === "night") {
      ctx.fillStyle = "rgba(5, 5, 25, 0.52)";
      ctx.fillRect(0, 0, Wpx, Hpx);
    }
    if (amb.weather === "rain" || amb.weather === "heavy_rain") {
      const dense = amb.weather === "heavy_rain" ? 1.45 : 1;
      ctx.strokeStyle = "rgba(180, 200, 255, 0.22)";
      ctx.lineWidth = 1;
      const ph = (opts.animPhase ?? 0) * Math.PI * 2;
      for (let i = 0; i < 420 * dense; i++) {
        const rx = (Math.sin(i * 12.9898 + ph) * 0.5 + 0.5) * Wpx;
        const ry = (i / (420 * dense)) * Hpx * 1.2 - Hpx * 0.1;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + 3, ry + 10);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  const tokens = opts.battleTokens;
  if (tokens?.length) {
    drawBattleTokens(ctx, tokens, cellPx, fog, cols, rows, opts.tokenImages ?? null);
  }

  const ringR = opts.playerSightRingCells;
  if (ringR != null && ringR > 0 && tokens?.length) {
    drawPlayerSightRings(ctx, tokens, ringR, cellPx, fog, cols, rows);
  }

  if (!ink) {
    if (depthFog && mergedLights.length > 0) {
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          if (fog && !fog.has(`${x},${y}`)) continue;
          let dMin = 1e9;
          for (const L of mergedLights) {
            dMin = Math.min(dMin, Math.hypot(x - L.gx, y - L.gy));
          }
          if (dMin < 8) continue;
          const alpha = dMin >= 16 ? 0.6 : ((dMin - 8) / 8) * 0.6;
          if (alpha < 0.02) continue;
          const px = x * cellPx;
          const py = y * cellPx;
          ctx.fillStyle = `rgba(0,0,0,${alpha})`;
          ctx.fillRect(px, py, cellPx, cellPx);
        }
      }
    }
    if (vignettePass) {
      const cx = cssW / 2;
      const cy = cssH / 2;
      const r = Math.hypot(cssW, cssH) / 2;
      const g = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.restore();
    }
  }
}

function drawPlayerSightRings(
  ctx: CanvasRenderingContext2D,
  tokens: BattleToken[],
  ringCellsFallback: number,
  cellPx: number,
  fog: Set<string> | null | undefined,
  cols: number,
  rows: number,
): void {
  ctx.save();
  ctx.lineJoin = "round";
  for (const t of tokens) {
    if (t.kind !== "player") continue;
    const gx = Math.floor(t.gx);
    const gy = Math.floor(t.gy);
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
    if (fog && !fog.has(`${gx},${gy}`)) continue;
    const cells = Math.max(2, Math.floor(t.sightRadiusCells ?? ringCellsFallback));
    const rPx = cells * cellPx;
    const cx = (gx + 0.5) * cellPx;
    const cy = (gy + 0.5) * cellPx;
    ctx.strokeStyle = "rgba(255, 220, 140, 0.42)";
    ctx.lineWidth = Math.max(1, cellPx * 0.1);
    ctx.setLineDash([Math.max(2, cellPx * 0.2), Math.max(2, cellPx * 0.15)]);
    ctx.beginPath();
    ctx.arc(cx, cy, rPx, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTokenImageInCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  img: HTMLImageElement,
): boolean {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return false;
  const d = radius * 2;
  const scale = Math.max(d / iw, d / ih);
  const w = iw * scale;
  const h = ih * scale;
  const dx = cx - w / 2;
  const dy = cy - h / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(img, dx, dy, w, h);
  ctx.restore();
  return true;
}

function tokenImageUrl(t: BattleToken): string | undefined {
  const raw = t.portraitUrl || t.spriteUrl;
  if (!raw) return undefined;
  return publicAssetUrl(raw);
}

function drawBattleTokens(
  ctx: CanvasRenderingContext2D,
  tokens: BattleToken[],
  cellPx: number,
  fog: Set<string> | null | undefined,
  cols: number,
  rows: number,
  tokenImages: Map<string, HTMLImageElement> | null,
): void {
  const perCell = new Map<string, BattleToken[]>();
  for (const t of tokens) {
    const gx = Math.floor(t.gx);
    const gy = Math.floor(t.gy);
    const k = `${gx},${gy}`;
    if (!perCell.has(k)) perCell.set(k, []);
    perCell.get(k)!.push(t);
  }
  const stackIdx = new Map<BattleToken, number>();
  for (const arr of perCell.values()) {
    arr.forEach((t, i) => stackIdx.set(t, i));
  }

  for (const t of tokens) {
    const gx = Math.floor(t.gx);
    const gy = Math.floor(t.gy);
    if (gx < 0 || gy < 0 || gx >= cols || gy >= rows) continue;
    if (fog && !fog.has(`${gx},${gy}`)) continue;
    const px = gx * cellPx;
    const py = gy * cellPx;
    const s = cellPx;
    const si = stackIdx.get(t) ?? 0;
    const ox = ((si % 3) - 1) * s * 0.2;
    const oy = Math.floor(si / 3) * s * 0.18;
    const cx = px + s / 2 + ox;
    const cy = py + s / 2 + oy;
    const radius = Math.max(3, s * 0.34);
    const url = tokenImageUrl(t);
    const img = url && tokenImages ? tokenImages.get(url) : undefined;
    let drew = false;
    if (img && img.complete && img.naturalWidth > 0) {
      drew = drawTokenImageInCircle(ctx, cx, cy, radius, img);
    }
    if (!drew) {
      const fill = t.kind === "player" ? "#4ade80" : "#f87171";
      ctx.fillStyle = fill;
      ctx.strokeStyle = "rgba(0,0,0,0.88)";
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const short =
        (t.label ?? "").trim().slice(0, 2).toUpperCase() || (t.kind === "player" ? "P" : "M");
      if (s >= 9) {
        ctx.fillStyle = "#0c0c0c";
        ctx.font = `bold ${Math.floor(s * 0.36)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(short, cx, cy + 0.5);
      }
      continue;
    }
    ctx.strokeStyle = "rgba(0,0,0,0.88)";
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBaseTile(
  ctx: CanvasRenderingContext2D,
  cell: RenderCell,
  px: number,
  py: number,
  s: number,
  p: TilePalette,
  _grid: RenderCell[][],
  gx: number,
  gy: number,
  _cols: number,
  _rows: number,
  showEnts: boolean,
  sanitize: boolean,
  hideDeco: Set<string>,
  doorOpen?: Set<string> | null,
  doorStates?: Record<string, string> | null,
  animPhase = 0,
): void {
  const t = cell.tile;
  if (sanitize && t === T_SECRET_DOOR) {
    drawTileByKind(ctx, T_WALL, px, py, s, p, true, doorOpen, doorStates, gx, gy, animPhase);
    return;
  }

  const hideEntityOverlay =
    !showEnts &&
    (cell.eType === "monster" ||
      cell.eType === "trap" ||
      cell.eType === "item" ||
      cell.eType === "riddle" ||
      cell.eType === "dm_marker" ||
      cell.eType === "spawn_suggestion");
  const hideLabel = sanitize && cell.eType === "label";
  const hideDecoCell =
    sanitize &&
    cell.eType === "deco" &&
    cell.extra &&
    typeof cell.extra === "object" &&
    "decoKey" in cell.extra &&
    hideDeco.has(String((cell.extra as { decoKey?: string }).decoKey));

  if (hideEntityOverlay || hideLabel || hideDecoCell) {
    drawTileByKind(ctx, t, px, py, s, p, true, doorOpen, doorStates, gx, gy, animPhase);
    return;
  }

  drawTileByKind(ctx, t, px, py, s, p, false, doorOpen, doorStates, gx, gy, animPhase);
}

function drawTileByKind(
  ctx: CanvasRenderingContext2D,
  t: number,
  px: number,
  py: number,
  s: number,
  p: TilePalette,
  mutedFloor: boolean,
  doorOpen?: Set<string> | null,
  doorStates?: Record<string, string> | null,
  gx?: number,
  gy?: number,
  animPhase = 0,
): void {
  if (t === T_VOID) {
    ctx.fillStyle = p.void;
    ctx.fillRect(px, py, s, s);
    return;
  }

  if (t === T_WALL) {
    ctx.fillStyle = p.wallBg;
    ctx.fillRect(px, py, s, s);
    ctx.fillStyle = p.wallFg;
    ctx.fillRect(px, py, s, Math.max(1, Math.floor(s * 0.12)));
    ctx.fillRect(px, py, Math.max(1, Math.floor(s * 0.08)), s);
    ctx.fillStyle = p.wallShadow;
    const sh = Math.max(1, Math.floor(s * 0.15));
    ctx.fillRect(px, py + s - sh, s, sh);
    const sw = Math.max(1, Math.floor(s * 0.1));
    ctx.fillRect(px + s - sw, py, sw, s);
    if (s >= 10) {
      ctx.strokeStyle = p.wallShadow;
      ctx.lineWidth = Math.max(0.5, s * 0.04);
      ctx.globalAlpha = 0.4;
      const bh = Math.floor(s * 0.35);
      for (let by = bh; by < s - 2; by += bh) {
        ctx.beginPath();
        ctx.moveTo(px + 1, py + by);
        ctx.lineTo(px + s - 1, py + by);
        ctx.stroke();
      }
      const bw = Math.floor(s * 0.5);
      const offset = py % 2 === 0 ? 0 : Math.floor(bw * 0.5);
      for (let bx2 = offset + bw; bx2 < s - 1; bx2 += bw) {
        ctx.beginPath();
        ctx.moveTo(px + bx2, py + 1);
        ctx.lineTo(px + bx2, py + s - 1);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    return;
  }

  if (t === T_FLOOR || t === T_CORRIDOR) {
    const isCorr = t === T_CORRIDOR;
    const bg = mutedFloor ? p.floorBg : isCorr ? p.corridorBg : p.floorBg;
    const detail = mutedFloor ? p.floorDetail : isCorr ? p.corridorFg : p.floorDetail;
    ctx.fillStyle = bg;
    ctx.fillRect(px, py, s, s);
    const dotThreshold = isCorr ? 8 : 12;
    const dotAlpha = mutedFloor ? 0.2 : isCorr ? 0.25 : 0.22;
    if (s >= dotThreshold) {
      ctx.fillStyle = detail;
      ctx.globalAlpha = dotAlpha;
      const spacing = Math.floor(s / 4);
      for (let dotX = spacing; dotX < s; dotX += spacing) {
        for (let dotY = spacing; dotY < s; dotY += spacing) {
          const r = Math.max(0.5, s * 0.04);
          ctx.beginPath();
          ctx.arc(px + dotX, py + dotY, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
    if (isCorr && s >= 8 && gx != null && gy != null) {
      const mid = Math.floor(s / 2);
      ctx.strokeStyle = detail;
      ctx.globalAlpha = mutedFloor ? 0.12 : 0.32;
      ctx.lineWidth = Math.max(0.5, s * 0.09);
      ctx.beginPath();
      ctx.moveTo(px + mid, py + 2);
      ctx.lineTo(px + mid, py + s - 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    return;
  }

  if (t === T_DOOR) {
    const dk = gx != null && gy != null ? `${gx},${gy}` : null;
    const closed = !isDoorOpenForRender(dk, doorOpen ?? null, doorStates ?? null);
    ctx.fillStyle = closed ? p.wallBg : p.doorBg;
    ctx.fillRect(px, py, s, s);
    const pad = Math.max(1, Math.floor(s * 0.15));
    const frameW = Math.max(1, Math.floor(s * 0.12));
    ctx.strokeStyle = closed ? p.wallFg : p.doorFg;
    ctx.lineWidth = frameW;
    ctx.strokeRect(px + pad, py + pad, s - pad * 2, s - pad * 2);
    if (closed) {
      ctx.fillStyle = p.wallShadow;
      const bar = Math.max(1, Math.floor(s * 0.12));
      const mid = px + Math.floor(s / 2) - Math.floor(bar / 2);
      ctx.fillRect(mid, py + pad + frameW, bar, s - (pad + frameW) * 2);
      ctx.fillStyle = p.wallFg;
      ctx.globalAlpha = 0.35;
      ctx.fillRect(px + pad + 1, py + pad + 1, s - pad * 2 - 2, Math.max(1, Math.floor(s * 0.08)));
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = p.doorAccent;
      ctx.fillRect(px + pad + frameW, py + pad + frameW, s - (pad + frameW) * 2, s - (pad + frameW) * 2);
      if (s >= 12) {
        ctx.fillStyle = p.doorFg;
        ctx.beginPath();
        ctx.arc(px + s * 0.72, py + s * 0.5, Math.max(1, s * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return;
  }

  if (t === T_STAIRS_UP || t === T_STAIRS_DOWN) {
    ctx.fillStyle = p.stairsBg;
    ctx.fillRect(px, py, s, s);
    const isUp = t === T_STAIRS_UP;
    const steps = Math.max(2, Math.floor(s / 4));
    const stepH = s / steps;
    ctx.fillStyle = p.stairsFg;
    ctx.globalAlpha = 0.6;
    for (let i = 0; i < steps; i++) {
      const sy = isUp ? py + i * stepH : py + (steps - 1 - i) * stepH;
      const indentL = Math.floor((i / steps) * s * 0.15);
      const indentR = Math.floor(((steps - i) / steps) * s * 0.15);
      ctx.fillRect(px + indentL, sy, s - indentL - indentR, Math.max(1, stepH * 0.7));
    }
    ctx.globalAlpha = 1;
    if (s >= 10) {
      drawArrow(ctx, px + s / 2, py + s / 2, s * 0.3, isUp ? "up" : "down", p.stairsFg);
    }
    return;
  }

  if (t === T_WATER) {
    const ph = animPhase * Math.PI * 2;
    const gyJ = gy ?? 0;
    ctx.fillStyle = p.waterBg;
    ctx.fillRect(px, py, s, s);
    if (s >= 8) {
      ctx.strokeStyle = p.waterWave;
      ctx.lineWidth = Math.max(0.5, s * 0.06);
      ctx.globalAlpha = 0.5;
      const waveRows = Math.floor(s / 4);
      for (let wi = 1; wi <= waveRows; wi++) {
        const wy = py + (wi / (waveRows + 1)) * s;
        const amp = s * 0.06;
        ctx.beginPath();
        ctx.moveTo(px, wy);
        for (let wx = 0; wx < s; wx += 2) {
          ctx.lineTo(px + wx, wy + Math.sin((wx / s) * Math.PI * 2 + ph + gyJ * 0.15) * amp);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    return;
  }

  if (t === T_LAVA) {
    const ph = animPhase * Math.PI * 2;
    const gyJ = gy ?? 0;
    const lb = p.lavaBg ?? p.waterBg;
    const lg = p.lavaGlow ?? p.waterWave;
    ctx.fillStyle = lb;
    ctx.fillRect(px, py, s, s);
    if (s >= 8) {
      ctx.strokeStyle = lg;
      ctx.lineWidth = Math.max(0.5, s * 0.07);
      ctx.globalAlpha = 0.55;
      const waveRows = Math.floor(s / 3);
      for (let wi = 1; wi <= waveRows; wi++) {
        const wy = py + (wi / (waveRows + 1)) * s;
        const amp = s * 0.08;
        ctx.beginPath();
        ctx.moveTo(px, wy);
        for (let wx = 0; wx < s; wx += 2) {
          ctx.lineTo(px + wx, wy + Math.sin((wx / s) * Math.PI * 3 + ph + gyJ * 0.22) * amp);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    return;
  }

  if (t === T_PILLAR) {
    ctx.fillStyle = p.floorBg;
    ctx.fillRect(px, py, s, s);
    const pad = Math.floor(s * 0.15);
    ctx.fillStyle = p.pillarBg;
    ctx.fillRect(px + pad, py + pad, s - pad * 2, s - pad * 2);
    ctx.fillStyle = p.pillarFg;
    ctx.fillRect(px + pad, py + pad, s - pad * 2, Math.max(1, Math.floor(s * 0.12)));
    ctx.fillRect(px + pad, py + pad, Math.max(1, Math.floor(s * 0.1)), s - pad * 2);
    ctx.fillStyle = p.pillarShadow;
    const sh2 = Math.max(1, Math.floor(s * 0.15));
    ctx.fillRect(px + pad, py + s - pad - sh2, s - pad * 2, sh2);
    ctx.fillRect(px + s - pad - sh2, py + pad, sh2, s - pad * 2);
    return;
  }

  if (t === T_BRIDGE) {
    const bb = p.bridgeBg ?? p.corridorBg;
    const bf = p.bridgeFg ?? p.floorDetail;
    ctx.fillStyle = bb;
    ctx.fillRect(px, py, s, s);
    const plank = Math.max(2, Math.floor(s / 4));
    ctx.strokeStyle = bf;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = Math.max(0.5, s * 0.06);
    for (let u = plank; u < s - 1; u += plank) {
      ctx.beginPath();
      ctx.moveTo(px + u, py + 1);
      ctx.lineTo(px + u, py + s - 1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }

  if (t === T_SECRET_DOOR) {
    ctx.fillStyle = "#1e1428";
    ctx.fillRect(px, py, s, s);
    ctx.strokeStyle = "#a08038";
    ctx.lineWidth = Math.max(1, s * 0.09);
    ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
    ctx.fillStyle = "#e8c048";
    ctx.font = `bold ${Math.max(9, s * 0.52)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", px + s / 2, py + s / 2 + 0.5);
    return;
  }

  if (t === T_PIT) {
    ctx.fillStyle = p.floorBg;
    ctx.globalAlpha = 0.88;
    ctx.fillRect(px, py, s, s);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.floorDetail;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(0.5, s * 0.06);
    for (let i = -s; i < s * 2; i += Math.max(3, Math.floor(s / 4))) {
      ctx.beginPath();
      ctx.moveTo(px + i, py);
      ctx.lineTo(px + i + s, py + s);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = p.corridorFg;
    ctx.font = `${Math.max(7, s * 0.28)}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("▿▿", px + s / 2, py + s * 0.55);
    return;
  }

  if (t === T_GATE) {
    const dk = gx != null && gy != null ? `${gx},${gy}` : null;
    const closed = !isDoorOpenForRender(dk, doorOpen ?? null, doorStates ?? null);
    ctx.fillStyle = closed ? p.wallBg : p.roadBg;
    ctx.fillRect(px, py, s, s);
    ctx.strokeStyle = p.doorFg;
    ctx.lineWidth = Math.max(1, s * 0.1);
    ctx.strokeRect(px + 2, py + 2, s - 4, s - 4);
    ctx.fillStyle = p.doorFg;
    ctx.font = `bold ${Math.max(8, s * 0.42)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(closed ? "Ⅱ" : "◂▸", px + s / 2, py + s / 2 + 0.5);
    return;
  }

  if (t === T_DRAWBRIDGE) {
    const dk = gx != null && gy != null ? `${gx},${gy}` : null;
    const up = !isDoorOpenForRender(dk, doorOpen ?? null, doorStates ?? null);
    ctx.fillStyle = up ? p.wallBg : p.bridgeBg ?? p.floorBg;
    ctx.fillRect(px, py, s, s);
    ctx.fillStyle = p.doorFg;
    ctx.font = `bold ${Math.max(8, s * 0.5)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(up ? "‖" : "═", px + s / 2, py + s / 2 + 0.5);
    return;
  }

  if (t === T_HEADSTONE) {
    ctx.fillStyle = p.floorBg;
    ctx.fillRect(px, py, s, s);
    ctx.fillStyle = "#7a7a82";
    ctx.fillRect(px + Math.floor(s * 0.2), py + Math.floor(s * 0.15), Math.floor(s * 0.6), Math.floor(s * 0.7));
    ctx.fillStyle = "#b0b0b8";
    ctx.font = `${Math.max(8, s * 0.55)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("†", px + s / 2, py + s / 2 + 0.5);
    return;
  }

  if (t === T_ARROW_SLIT || t === T_MURDER_HOLE) {
    ctx.fillStyle = p.wallBg;
    ctx.fillRect(px, py, s, s);
    ctx.fillStyle = "#111";
    const slotW = t === T_MURDER_HOLE ? Math.max(1, Math.floor(s * 0.22)) : Math.max(1, Math.floor(s * 0.16));
    const slotTop = t === T_MURDER_HOLE ? Math.floor(s * 0.08) : Math.floor(s * 0.12);
    ctx.fillRect(px + Math.floor(s * 0.42), py + slotTop, slotW, Math.floor(s * 0.76));
    return;
  }

  if (t === T_CELL_BARS) {
    ctx.fillStyle = p.floorBg;
    ctx.fillRect(px, py, s, s);
    ctx.strokeStyle = "#9a9aa4";
    ctx.lineWidth = Math.max(1, s * 0.08);
    for (let u = 2; u < s - 1; u += Math.max(2, Math.floor(s / 5))) {
      ctx.beginPath();
      ctx.moveTo(px + u, py + 2);
      ctx.lineTo(px + u, py + s - 2);
      ctx.stroke();
    }
    return;
  }

  if (t === T_ALLEY) {
    ctx.fillStyle = p.roadBg;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(px, py, s, s);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = p.roadLine;
    ctx.globalAlpha = 0.35;
    ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
    ctx.globalAlpha = 1;
    return;
  }

  if (t === T_ROAD) {
    ctx.fillStyle = p.roadBg;
    ctx.fillRect(px, py, s, s);
    if (s >= 8) {
      ctx.strokeStyle = p.roadLine;
      ctx.lineWidth = Math.max(0.5, s * 0.04);
      ctx.globalAlpha = 0.4;
      const seg = Math.floor(s / 3);
      for (let gv = seg; gv < s; gv += seg) {
        ctx.beginPath();
        ctx.moveTo(px + gv, py);
        ctx.lineTo(px + gv, py + s);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px, py + gv);
        ctx.lineTo(px + s, py + gv);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    return;
  }

  ctx.fillStyle = p.floorBg;
  ctx.fillRect(px, py, s, s);
}

function drawWallTorchDeco(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  s: number,
  animPhase: number,
  accent: string,
): void {
  const flick = 0.82 + Math.sin(animPhase * Math.PI * 2 * 4.6) * 0.11 + Math.sin(animPhase * Math.PI * 2 * 10.3) * 0.05;
  const bob = Math.sin(animPhase * Math.PI * 2 * 2.8) * s * 0.025;
  const bx = px + Math.floor(s * 0.34);
  const by = py + Math.floor(s * 0.12) + bob;
  const w = Math.max(2, Math.floor(s * 0.22 * flick));
  const h = Math.max(3, Math.floor(s * 0.42 * flick));

  ctx.fillStyle = "#2c2824";
  ctx.fillRect(bx - 1, Math.floor(py + s * 0.52), Math.max(2, Math.floor(s * 0.22)), Math.floor(s * 0.38));

  ctx.fillStyle = "#1a0804";
  ctx.globalAlpha = 0.45;
  ctx.fillRect(bx - 1, by + h - 1, w + 3, Math.max(1, Math.floor(s * 0.04)));
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#cc4400";
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = "#ff7a1a";
  ctx.fillRect(
    bx + Math.floor(w * 0.15),
    by + Math.floor(h * 0.12),
    Math.max(1, Math.floor(w * 0.55)),
    Math.max(1, Math.floor(h * 0.5)),
  );
  ctx.fillStyle = "#ffe8a0";
  ctx.globalAlpha = 0.95;
  ctx.fillRect(
    bx + Math.floor(w * 0.35),
    by + Math.floor(h * 0.08),
    Math.max(1, Math.floor(w * 0.28)),
    Math.max(1, Math.floor(h * 0.28)),
  );
  ctx.globalAlpha = 1;

  const cx = bx + w / 2;
  const cy = by + h * 0.35;
  ctx.globalAlpha = 0.14 + flick * 0.1;
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.34 * flick, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawOverlays(
  ctx: CanvasRenderingContext2D,
  cell: RenderCell,
  px: number,
  py: number,
  s: number,
  _p: TilePalette,
  ep: EntityPalette,
  showEnts: boolean,
  sanitize: boolean,
  hideDeco: Set<string>,
  animPhase: number,
  entityTokenImages: Map<string, HTMLImageElement> | null,
): void {
  const ex = cell.extra && typeof cell.extra === "object" ? (cell.extra as { ghosted?: boolean }) : null;
  if (!showEnts && ex?.ghosted) return;

  const hideEntity =
    !showEnts &&
    (cell.eType === "monster" ||
      cell.eType === "trap" ||
      cell.eType === "item" ||
      cell.eType === "riddle" ||
      cell.eType === "dm_marker" ||
      cell.eType === "spawn_suggestion");
  if (hideEntity) return;

  if (sanitize && cell.eType === "label") return;
  if (
    sanitize &&
    cell.eType === "deco" &&
    cell.extra &&
    typeof cell.extra === "object" &&
    "decoKey" in cell.extra &&
    hideDeco.has(String((cell.extra as { decoKey?: string }).decoKey))
  ) {
    return;
  }

  const markerEnt =
    cell.eType === "headstone" ||
    cell.eType === "npc" ||
    cell.eType === "landmark" ||
    cell.eType === "notice_board" ||
    cell.eType === "stall" ||
    cell.eType === "siege" ||
    cell.eType === "banner" ||
    cell.eType === "portcullis";
  if (markerEnt) {
    const cx = px + s / 2;
    const cy = py + s / 2;
    ctx.fillStyle = "rgba(40,40,48,0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, s * 0.38), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ep.deco;
    ctx.font = `${Math.max(8, s * 0.55)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cell.ch.length > 2 ? cell.ch.slice(0, 2) : cell.ch, cx, cy + 0.5);
    return;
  }

  if (cell.eType === "monster" || cell.eType === "trap" || cell.eType === "item" || cell.eType === "riddle") {
    const radius = Math.max(2, s * 0.35);
    const cx = px + s / 2;
    const cy = py + s / 2;
    const bg =
      cell.eType === "monster"
        ? ep.monster
        : cell.eType === "trap"
          ? ep.trap
          : cell.eType === "item"
            ? ep.item
            : ep.riddle;

    let drewMonsterSprite = false;
    if (cell.eType === "monster" && entityTokenImages && cell.extra && typeof cell.extra === "object") {
      const slug = (cell.extra as { slug?: string }).slug;
      if (slug) {
        const url = publicAssetUrl(monsterTokenSpriteWithFallback(String(slug)));
        const img = entityTokenImages.get(url);
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(cx, cy, radius * 1.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          drewMonsterSprite = drawTokenImageInCircle(ctx, cx, cy, radius * 1.05, img);
        }
      }
    }

    if (!drewMonsterSprite) {
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      if (s >= 10) {
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${Math.floor(s * 0.55)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(cell.ch, cx, cy + 1);
      }
    }
    return;
  }

  if (cell.eType === "label") {
    const cx = px + s / 2;
    const cy = py + s / 2;
    const rad = Math.max(3, s * 0.38);
    ctx.fillStyle = "#2a6a3a";
    ctx.globalAlpha = 0.95;
    if (typeof ctx.roundRect === "function") {
      const rr = Math.min(rad * 0.45, s * 0.2);
      ctx.beginPath();
      ctx.roundRect(px + 1, py + 1, s - 2, s - 2, rr);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.floor(s * 0.55)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cell.ch, cx, cy + 1);
    return;
  }

  if (cell.eType === "deco") {
    const fg = cell.fg ?? ep.deco;
    const decoKey =
      cell.extra && typeof cell.extra === "object" && "decoKey" in cell.extra
        ? String((cell.extra as { decoKey?: string }).decoKey ?? "")
        : "";
    if (decoKey === "torch_w" && s >= 6) {
      drawWallTorchDeco(ctx, px, py, s, animPhase, fg);
      return;
    }
    ctx.fillStyle = fg;
    ctx.font = `${Math.floor(s * 0.65)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.9;
    ctx.fillText(cell.ch, px + s / 2, py + s / 2 + 1);
    ctx.globalAlpha = 1;
    return;
  }

  if (cell.eType === "theme") {
    ctx.fillStyle = ep.theme;
    ctx.font = `bold ${Math.floor(s * 0.55)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cell.ch.length > 1 ? cell.ch[0] : cell.ch, px + s / 2, py + s / 2 + 1);
    return;
  }

  if (cell.eType === "dm_marker") {
    const cx = px + s / 2;
    const cy = py + s / 2;
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = "rgba(40, 28, 10, 0.35)";
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = ep.label;
    ctx.font = `${Math.max(10, Math.floor(s * 0.52))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cell.ch.length > 2 ? cell.ch : "\u{1F441}", cx, cy + 1);
    return;
  }
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  dir: "up" | "down",
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  if (dir === "up") {
    ctx.moveTo(cx, cy - size);
    ctx.lineTo(cx + size * 0.7, cy + size * 0.5);
    ctx.lineTo(cx - size * 0.7, cy + size * 0.5);
  } else {
    ctx.moveTo(cx, cy + size);
    ctx.lineTo(cx + size * 0.7, cy - size * 0.5);
    ctx.lineTo(cx - size * 0.7, cy - size * 0.5);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}
