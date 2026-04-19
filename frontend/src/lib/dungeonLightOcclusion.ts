/**
 * Grid lighting with wall / door occlusion (4-way flood — no light through walls).
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
  if (
    t === T_HEADSTONE ||
    t === T_ARROW_SLIT ||
    t === T_MURDER_HOLE ||
    t === T_CELL_BARS
  )
    return true;
  if (t === T_DOOR || t === T_SECRET_DOOR || t === T_GATE || t === T_DRAWBRIDGE) {
    return !isDoorOpenForLight(`${gx},${gy}`, doorOpen, doorStates);
  }
  return false;
}

export type LightKind = NonNullable<SceneLight["kind"]>;

export type SceneLightInput = SceneLight;

function flickerMul(kind: LightKind | undefined, gx: number, gy: number, animPhase: number): number {
  const base = animPhase * Math.PI * 2;
  if (kind === "room") {
    // Static room/sconce wash — avoids recomputing heavy flicker across huge radii every frame.
    return 1;
  }
  if (kind === "token") {
    return 1 + Math.sin(base * 3.2 + gx * 0.4 + gy * 0.31) * 0.055 + Math.sin(base * 5.1 + gx * 0.11) * 0.025;
  }
  /* torch + default */
  return (
    1 +
    Math.sin(base * 4.3 + gx * 0.52 + gy * 0.38) * 0.09 +
    Math.sin(base * 7.8 + gx * 0.21) * 0.045 +
    Math.sin(base * 11.2 + gy * 0.17) * 0.022
  );
}

function inferKind(L: SceneLightInput): LightKind {
  if (L.kind) return L.kind;
  if (L.radiusCells >= 9) return "room";
  return "token";
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
      out.push({
        gx: x,
        gy: y,
        radiusCells: 5.5,
        intensity: 0.38,
        kind: "torch",
      });
    }
  }
  return out;
}

/**
 * Per-cell darkness alpha in [0, ~0.5] matching `rgba(0,0,0,alpha)` overlay (higher = darker).
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
  const doorOpen = opts.doorOpen ?? null;
  const doorStates = opts.doorStates ?? null;
  const bright = new Float32Array(cols * rows);
  const idx = (x: number, y: number) => y * cols + x;

  for (const L of lights) {
    const lx = Math.floor(L.gx);
    const ly = Math.floor(L.gy);
    const radius = Math.max(0.5, Number(L.radiusCells) || 4);
    const intScale = Math.min(1.8, (L.intensity ?? 0.48) / 0.48);
    const kind = inferKind(L);

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
      const flick = flickerMul(kind, x, y, opts.animPhase);
      const contrib = Math.min(1, falloff * flick * intScale);
      const i = idx(x, y);
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
      const b = bright[idx(x, y)];
      dark[idx(x, y)] = (1 - b) * 0.48;
    }
  }
  return dark;
}
