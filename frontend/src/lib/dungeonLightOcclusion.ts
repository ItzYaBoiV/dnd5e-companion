/**
 * Grid lighting with wall / door occlusion.
 * Default: radial ray-march shadow casting (soft penumbra).
 * Fallback: 4-way flood fill for very large maps (>100×100).
 */

import type { RenderCell } from "@/lib/dungeonTileRenderer";
import type { SceneLight } from "@/lib/playerMapBroadcast";

const T_VOID = 0;
const T_WALL = 2;
const T_DOOR = 3;
const T_PILLAR = 8;
const T_SECRET_DOOR = 12;
const T_GATE = 14;
const T_DRAWBRIDGE = 15;
const T_HEADSTONE = 16;
const T_ARROW_SLIT = 17;
const T_MURDER_HOLE = 18;
const T_CELL_BARS = 19;

const LARGE_MAP_CELLS = 100 * 100;

function isDoorOpenForLight(
  dk: string,
  doorOpen: Set<string> | null | undefined,
  doorStates: Record<string, string> | null | undefined,
): boolean {
  if (doorStates && Object.prototype.hasOwnProperty.call(doorStates, dk)) {
    return doorStates[dk] === "open";
  }
  if (doorOpen == null) return true;
  return doorOpen.has(dk);
}

/** True = light does not propagate through this cell (4-way flood fill). */
export function cellBlocksLightPropagation(
  cell: RenderCell,
  gx: number,
  gy: number,
  doorOpen: Set<string> | null | undefined,
  doorStates: Record<string, string> | null | undefined,
): boolean {
  const t = cell.tile;
  if (t === T_VOID) return true;
  if (t === T_WALL) return true;
  if (t === T_PILLAR) return true;
  if (t === T_HEADSTONE || t === T_ARROW_SLIT || t === T_MURDER_HOLE || t === T_CELL_BARS) return true;
  if (t === T_DOOR || t === T_SECRET_DOOR || t === T_GATE || t === T_DRAWBRIDGE) {
    return !isDoorOpenForLight(`${gx},${gy}`, doorOpen, doorStates);
  }
  return false;
}

export type LightKind = NonNullable<SceneLight["kind"]>;

export type SceneLightInput = SceneLight;

function inferKind(L: SceneLightInput): LightKind {
  if (L.kind) return L.kind;
  if (L.radiusCells >= 9) return "room";
  return "torch";
}

function flickerMul(L: SceneLightInput, gx: number, gy: number, animPhase: number): number {
  if (L.flicker === false) return 1;
  const base = animPhase * Math.PI * 2;
  const kind = inferKind(L);

  if (kind === "room" || kind === "divine") return 1;

  if (L.flicker === true && (kind === "wisp" || kind === "cold" || kind === "necrotic")) {
    return 1 + Math.sin(base * 5.5 + gx * 0.6 + gy * 0.4) * 0.08 + Math.sin(base * 9.2 + gx * 0.2) * 0.04;
  }

  if (kind === "token") {
    return 1 + Math.sin(base * 3.2 + gx * 0.4 + gy * 0.31) * 0.055 + Math.sin(base * 5.1 + gx * 0.11) * 0.025;
  }

  if (kind === "lantern") {
    return 1 + Math.sin(base * 2.8 + gx * 0.3 + gy * 0.25) * 0.04;
  }

  /* torch, fire, lava, fey, magic, default */
  return (
    1 +
    Math.sin(base * 4.3 + gx * 0.52 + gy * 0.38) * 0.09 +
    Math.sin(base * 7.8 + gx * 0.21) * 0.045 +
    Math.sin(base * 11.2 + gy * 0.17) * 0.022
  );
}

/** Wall torch decos from the forge (`torch_w`) act as warm point lights. */
export function collectTorchFixtureLights(grid: RenderCell[][], cols: number, rows: number): SceneLightInput[] {
  const out: SceneLightInput[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = grid[y]![x]!;
      if (c.eType !== "deco" || !c.extra || typeof c.extra !== "object") continue;
      const dk = String((c.extra as { decoKey?: string }).decoKey ?? "");
      if (dk !== "torch_w") continue;
      if ((c.extra as { townWallSconce?: boolean }).townWallSconce) continue;

      let offsetX = 0;
      let offsetY = 0;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const nt = grid[ny]![nx]!.tile;
        if (nt === T_WALL || nt === T_ARROW_SLIT || nt === T_MURDER_HOLE || nt === T_CELL_BARS) {
          offsetX = dx * 0.38;
          offsetY = dy * 0.38;
          break;
        }
      }

      out.push({
        gx: x,
        gy: y,
        offsetX: offsetX || undefined,
        offsetY: offsetY || undefined,
        radiusCells: 5.5,
        intensity: 0.42,
        kind: "torch",
      });
    }
  }
  return out;
}

function idx(cols: number, x: number, y: number): number {
  return y * cols + x;
}

/** Integer line cells from (x0,y0) to (x1,y1), inclusive start, Bresenham. */
/** Max black overlay alpha from light occlusion (lower = brighter overall maps). */
const LIGHT_DARKNESS_ALPHA_SCALE = 0.28;
/** Every cell gets at least this much “fill” light so distant corners are not pitch black. */
const AMBIENT_BRIGHT_FLOOR = 0.17;

function bresenhamLine(x0: number, y0: number, x1: number, y1: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/**
 * Legacy 4-way flood lighting (fast on huge grids).
 * Per-cell darkness alpha in [0, ~0.5] matching `rgba(0,0,0,alpha)` overlay (higher = darker).
 */
export function computeFloodFillLightDarkness(
  grid: RenderCell[][],
  cols: number,
  rows: number,
  lights: SceneLightInput[],
  opts: {
    doorOpen?: Set<string> | null;
    doorStates?: Record<string, string> | null;
    animPhase: number;
  },
): Float32Array {
  const doorOpen = opts.doorOpen ?? null;
  const doorStates = opts.doorStates ?? null;
  const bright = new Float32Array(cols * rows);

  for (const L of lights) {
    const lx = Math.floor(L.gx);
    const ly = Math.floor(L.gy);
    const radius = Math.max(0.5, Number(L.radiusCells) || 4);
    const intScale = Math.min(1.8, (L.intensity ?? 0.48) / 0.48);

    if (lx < 0 || ly < 0 || lx >= cols || ly >= rows) continue;
    if (cellBlocksLightPropagation(grid[ly]![lx]!, lx, ly, doorOpen, doorStates)) continue;

    const visited = new Set<string>();
    const q: { x: number; y: number }[] = [];
    let qi = 0;
    visited.add(`${lx},${ly}`);
    q.push({ x: lx, y: ly });

    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ];

    while (qi < q.length) {
      const { x, y } = q[qi++]!;
      const dx = x - lx;
      const dy = y - ly;
      const d = Math.hypot(dx, dy);
      const falloff = Math.max(0, 1 - d / Math.max(0.5, radius));
      const flick = flickerMul(L, x, y, opts.animPhase);
      const contrib = Math.min(1, falloff * flick * intScale);
      const i = idx(cols, x, y);
      if (contrib > bright[i]) bright[i] = contrib;

      for (const [ddx, ddy] of dirs) {
        const nx = x + ddx;
        const ny = y + ddy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const k = `${nx},${ny}`;
        if (visited.has(k)) continue;
        const nc = grid[ny]![nx]!;
        if (cellBlocksLightPropagation(nc, nx, ny, doorOpen, doorStates)) continue;
        visited.add(k);
        q.push({ x: nx, y: ny });
      }
    }
  }

  const dark = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = idx(cols, x, y);
      const b = Math.min(1, Math.max(bright[i], AMBIENT_BRIGHT_FLOOR));
      dark[i] = (1 - b) * LIGHT_DARKNESS_ALPHA_SCALE;
    }
  }
  return dark;
}

function computeRaycastLightDarkness(
  grid: RenderCell[][],
  cols: number,
  rows: number,
  lights: SceneLightInput[],
  opts: {
    doorOpen?: Set<string> | null;
    doorStates?: Record<string, string> | null;
    animPhase: number;
  },
): Float32Array {
  const doorOpen = opts.doorOpen ?? null;
  const doorStates = opts.doorStates ?? null;
  const bright = new Float32Array(cols * rows);

  for (const L of lights) {
    const lx = Math.floor(L.gx);
    const ly = Math.floor(L.gy);
    const radius = Math.max(1, Number(L.radiusCells) || 4);
    const intScale = Math.min(1.8, (L.intensity ?? 0.48) / 0.48);

    if (lx < 0 || ly < 0 || lx >= cols || ly >= rows) continue;
    if (cellBlocksLightPropagation(grid[ly]![lx]!, lx, ly, doorOpen, doorStates)) continue;

    const nRays = Math.min(360, Math.max(48, Math.ceil(2 * Math.PI * radius * 2)));
    const twoPi = Math.PI * 2;

    for (let ri = 0; ri < nRays; ri++) {
      const theta = (ri / nRays) * twoPi;
      const ex = lx + Math.round(Math.cos(theta) * radius * 2.2);
      const ey = ly + Math.round(Math.sin(theta) * radius * 2.2);
      const line = bresenhamLine(lx, ly, ex, ey);

      for (const p of line) {
        const { x, y } = p;
        if (x < 0 || y < 0 || x >= cols || y >= rows) break;
        const d = Math.hypot(x - lx, y - ly);
        if (d > radius + 0.001) break;

        const cell = grid[y]![x]!;
        if (cellBlocksLightPropagation(cell, x, y, doorOpen, doorStates)) break;

        const falloff = Math.max(0, 1 - d / radius);
        const contrib = Math.min(1, intScale * Math.pow(falloff, 1.5) * flickerMul(L, x, y, opts.animPhase));
        const i = idx(cols, x, y);
        bright[i] += contrib;
      }
    }
  }

  for (let i = 0; i < bright.length; i++) {
    bright[i] = Math.min(1, bright[i]);
  }

  /* Soft penumbra: shadow cells touching lit neighbors get ~15% bleed */
  const bleed = new Float32Array(bright);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = idx(cols, x, y);
      if (bleed[i] >= 0.08) continue;
      let mx = 0;
      for (const [dx, dy] of [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        mx = Math.max(mx, bleed[idx(cols, nx, ny)]);
      }
      if (mx > 0.2) bright[i] = Math.max(bright[i], mx * 0.15);
    }
  }

  const dark = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = idx(cols, x, y);
      const b = Math.min(1, Math.max(bright[i], AMBIENT_BRIGHT_FLOOR));
      dark[i] = (1 - b) * LIGHT_DARKNESS_ALPHA_SCALE;
    }
  }
  return dark;
}

/**
 * Per-cell darkness alpha matching `rgba(0,0,0,alpha)` overlay (higher = darker).
 */
export function computeOccludedLightDarkness(
  grid: RenderCell[][],
  cols: number,
  rows: number,
  lights: SceneLightInput[],
  opts: {
    doorOpen?: Set<string> | null;
    doorStates?: Record<string, string> | null;
    animPhase: number;
  },
): Float32Array {
  if (cols * rows > LARGE_MAP_CELLS) {
    return computeFloodFillLightDarkness(grid, cols, rows, lights, opts);
  }
  return computeRaycastLightDarkness(grid, cols, rows, lights, opts);
}

/** Single light-map build (call once per frame from renderers). */
export function buildLightMap(
  grid: RenderCell[][],
  cols: number,
  rows: number,
  lights: SceneLightInput[],
  doorOpen: Set<string> | null | undefined,
  doorStates: Record<string, string> | null | undefined,
  animPhase: number,
): Float32Array {
  return computeOccludedLightDarkness(grid, cols, rows, lights, {
    doorOpen: doorOpen ?? null,
    doorStates: doorStates ?? null,
    animPhase,
  });
}
