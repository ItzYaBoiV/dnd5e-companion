/**
 * High-quality logical ASCII / Unicode dungeon maps from the same room graph as the canvas.
 *
 * **Density ladder**
 * - `density: 1` — one Unicode character per layout cell (default, backward compatible).
 * - `density: 2` — pairs of map rows merged with half-blocks (▀▄█) for a shorter, bolder wall read.
 * - `density: 4` — each cell supersampled to a 4×4 fine mask, packed into quadrant block characters (~2× linear size).
 *
 * Example: `buildAsciiDungeonMap(rooms, { mode: "dm", density: 4 })` for a finer wall mesh before PNG export.
 */

import type { DungeonMapRoom } from "./dungeonMapCanvas";
import { applyAsciiDensity, type AsciiDensity } from "./dungeonAsciiDensity";

export type { AsciiDensity };
export type AsciiMapMode = "dm" | "player";

const ROOM_MARKERS = "123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function layoutKey(r: DungeonMapRoom): string {
  const lid = typeof r.layoutId === "string" && r.layoutId.trim() ? r.layoutId.trim() : "";
  if (lid) return lid;
  return typeof r.id === "string" && r.id.trim() ? r.id.trim() : "";
}

/** Sort for stable numbering (reading order). */
function sortedRooms(rooms: DungeonMapRoom[]): DungeonMapRoom[] {
  return [...rooms].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return layoutKey(a).localeCompare(layoutKey(b));
  });
}

function buildLayoutIndex(ordered: DungeonMapRoom[]): Map<string, number> {
  const m = new Map<string, number>();
  ordered.forEach((r, i) => {
    const k = layoutKey(r);
    if (k) m.set(k, i);
  });
  return m;
}

type Grid = { rid: number; w: number; h: number; minX: number; minY: number; cells: Int16Array };

function buildOccupancy(ordered: DungeonMapRoom[]): Grid | null {
  if (ordered.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of ordered) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.width);
    maxY = Math.max(maxY, r.y + r.height);
  }
  const pad = 1;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const w = maxX - minX;
  const h = maxY - minY;
  const cells = new Int16Array(w * h).fill(-1);
  const cellIndex = (x: number, y: number) => (y - minY) * w + (x - minX);

  ordered.forEach((r, ri) => {
    for (let dy = 0; dy < r.height; dy++) {
      for (let dx = 0; dx < r.width; dx++) {
        const gx = r.x + dx;
        const gy = r.y + dy;
        cells[cellIndex(gx, gy)] = ri;
      }
    }
  });

  return { rid: 0, w, h, minX, minY, cells };
}

function getRid(g: Grid, gx: number, gy: number): number {
  if (gx < g.minX || gy < g.minY || gx >= g.minX + g.w || gy >= g.minY + g.h) return -1;
  return g.cells[(gy - g.minY) * g.w + (gx - g.minX)] ?? -1;
}

/** Orthogonal neighbor walkable (inside some room). */
function isFloor(g: Grid, gx: number, gy: number): boolean {
  return getRid(g, gx, gy) >= 0;
}

/**
 * Light Unicode box-drawing for wall cells (void touching walkable).
 * NESW = floor on that side of this wall cell.
 */
function wallChar(g: Grid, gx: number, gy: number): string {
  const n = isFloor(g, gx, gy - 1);
  const s = isFloor(g, gx, gy + 1);
  const e = isFloor(g, gx + 1, gy);
  const w = isFloor(g, gx - 1, gy);
  const bits = (n ? 8 : 0) | (e ? 4 : 0) | (s ? 2 : 0) | (w ? 1 : 0);

  const T: Record<number, string> = {
    0: " ",
    8: "╵",
    4: "╶",
    2: "╷",
    1: "╴",
    12: "┌",
    9: "┐",
    6: "└",
    3: "┘",
    10: "│",
    5: "─",
    14: "├",
    7: "┬",
    11: "┤",
    13: "┴",
    15: "┼",
  };
  return T[bits] ?? "█";
}

function roomCells(g: Grid, roomIndex: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let gy = g.minY; gy < g.minY + g.h; gy++) {
    for (let gx = g.minX; gx < g.minX + g.w; gx++) {
      if (getRid(g, gx, gy) === roomIndex) out.push({ x: gx, y: gy });
    }
  }
  return out;
}

function pickCenter(cells: { x: number; y: number }[]): { x: number; y: number } {
  if (cells.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const c of cells) {
    sx += c.x;
    sy += c.y;
  }
  const mx = sx / cells.length;
  const my = sy / cells.length;
  let best = cells[0]!;
  let bestD = Infinity;
  for (const c of cells) {
    const d = (c.x - mx) ** 2 + (c.y - my) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

function pickCorner(cells: { x: number; y: number }[], avoid: Set<string>): { x: number; y: number } | null {
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const c of sorted) {
    const k = `${c.x},${c.y}`;
    if (!avoid.has(k)) return c;
  }
  return null;
}

export type AsciiDungeonMapResult = {
  /** Full text: map + blank line + legend */
  text: string;
  mapOnly: string;
  legend: string;
  width: number;
  height: number;
};

/**
 * Build ASCII/Unicode map. Uses logical dungeon cells (same as canvas); walls drawn in void around rooms.
 */
function roomTheme(r: DungeonMapRoom): string | null {
  const t = r.theme?.trim() || r.themeTag?.trim();
  if (t) return t;
  const lm = r.features?.layoutMeta;
  const x = lm?.themeTag?.trim();
  return x || null;
}

export function buildAsciiDungeonMap(
  rooms: DungeonMapRoom[],
  opts: { mode: AsciiMapMode; maxLineWidth?: number; density?: AsciiDensity },
): AsciiDungeonMapResult {
  const ordered = sortedRooms(rooms);
  const g = buildOccupancy(ordered);
  if (!g) {
    return { text: "", mapOnly: "", legend: "", width: 0, height: 0 };
  }

  const layoutToIndex = buildLayoutIndex(ordered);
  const doorCells = new Set<string>();

  /** One door tile on the lower-index room’s side of a shared edge. */
  const markDoor = (ax: number, ay: number, bx: number, by: number) => {
    const ia = getRid(g, ax, ay);
    const ib = getRid(g, bx, by);
    if (ia < 0 || ib < 0 || ia === ib) return;
    const pickA = ia < ib;
    const x = pickA ? ax : bx;
    const y = pickA ? ay : by;
    doorCells.add(`${x},${y}`);
  };

  for (const r of ordered) {
    const ex = r.exits;
    if (!ex || typeof ex !== "object") continue;
    const from = layoutKey(r);
    const myI = layoutToIndex.get(from) ?? -1;
    if (myI < 0) continue;

    const tryDir = (dir: string) => {
      const tid = ex[dir];
      if (typeof tid !== "string" || !tid.trim()) return;
      const oi = layoutToIndex.get(tid.trim());
      if (oi === undefined) return;
      const other = ordered[oi]!;
      if (dir === "north") {
        const x0 = Math.max(r.x, other.x);
        const x1 = Math.min(r.x + r.width, other.x + other.width);
        if (x1 > x0) {
          const gx = x0 + Math.floor((x1 - x0) / 2);
          if (getRid(g, gx, r.y) === myI && getRid(g, gx, r.y - 1) === oi) markDoor(gx, r.y, gx, r.y - 1);
        }
      }
      if (dir === "south") {
        const x0 = Math.max(r.x, other.x);
        const x1 = Math.min(r.x + r.width, other.x + other.width);
        if (x1 > x0) {
          const gx = x0 + Math.floor((x1 - x0) / 2);
          const ay = r.y + r.height - 1;
          if (getRid(g, gx, ay) === myI && getRid(g, gx, ay + 1) === oi) markDoor(gx, ay, gx, ay + 1);
        }
      }
      if (dir === "east") {
        const y0 = Math.max(r.y, other.y);
        const y1 = Math.min(r.y + r.height, other.y + other.height);
        if (y1 > y0) {
          const gy = y0 + Math.floor((y1 - y0) / 2);
          const ax = r.x + r.width - 1;
          if (getRid(g, ax, gy) === myI && getRid(g, ax + 1, gy) === oi) markDoor(ax, gy, ax + 1, gy);
        }
      }
      if (dir === "west") {
        const y0 = Math.max(r.y, other.y);
        const y1 = Math.min(r.y + r.height, other.y + other.height);
        if (y1 > y0) {
          const gy = y0 + Math.floor((y1 - y0) / 2);
          if (getRid(g, r.x, gy) === myI && getRid(g, r.x - 1, gy) === oi) markDoor(r.x, gy, r.x - 1, gy);
        }
      }
    };

    tryDir("north");
    tryDir("south");
    tryDir("east");
    tryDir("west");
  }

  const secretHintKeys = new Set<string>();
  if (opts.mode === "dm") {
    ordered.forEach((r, i) => {
      const f = r.features as { secretDoors?: unknown[] } | null | undefined;
      if (!Array.isArray(f?.secretDoors) || f.secretDoors.length === 0) return;
      const cells = roomCells(g, i);
      const perim = cells.filter((c) =>
        [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ].some(([dx, dy]) => getRid(g, c.x + dx, c.y + dy) !== i),
      );
      const centers = new Set<string>();
      const center = pickCenter(cells);
      centers.add(`${center.x},${center.y}`);
      let pick =
        perim.find((c) => {
          const k = `${c.x},${c.y}`;
          return !doorCells.has(k) && !centers.has(k);
        }) ?? null;
      if (!pick) {
        pick = perim.find((c) => !doorCells.has(`${c.x},${c.y}`)) ?? null;
      }
      if (pick && !centers.has(`${pick.x},${pick.y}`)) {
        secretHintKeys.add(`${pick.x},${pick.y}`);
      }
    });
  }

  const chars: string[][] = [];
  const overlay = new Map<string, string>();
  const used = new Set<string>();

  ordered.forEach((r, i) => {
    const marker = ROOM_MARKERS[i] ?? "?";
    const cells = roomCells(g, i);
    const center = pickCenter(cells);
    overlay.set(`${center.x},${center.y}`, marker);
    used.add(`${center.x},${center.y}`);

    if (opts.mode === "dm") {
      const avoid = new Set(used);
      const corner = pickCorner(cells, avoid);
      if (corner) {
        let sym: string | null = null;
        if (r.traps) sym = "!";
        else if (r.type === "trap") sym = "!";
        else if (Array.isArray(r.monsters) && r.monsters.length > 0) sym = "⚔";
        else if (r.treasures && ((r.treasures.gold ?? 0) > 0 || (r.treasures.items?.length ?? 0) > 0)) sym = "◆";
        const feats = r.features as { hiddenStashes?: unknown[] } | undefined;
        if (!sym && Array.isArray(feats?.hiddenStashes) && feats.hiddenStashes.length > 0) sym = "✦";
        if (sym) {
          const k = `${corner.x},${corner.y}`;
          if (!overlay.has(k)) {
            overlay.set(k, sym);
            used.add(k);
          }
        }
      }
    }
  });

  for (const k of doorCells) {
    overlay.set(k, "+");
  }

  for (const k of secretHintKeys) {
    if (!doorCells.has(k)) overlay.set(k, "S");
  }

  for (let gy = g.minY; gy < g.minY + g.h; gy++) {
    const row: string[] = [];
    for (let gx = g.minX; gx < g.minX + g.w; gx++) {
      const k = `${gx},${gy}`;
      const floor = isFloor(g, gx, gy);
      if (floor) {
        row.push(overlay.get(k) ?? "·");
      } else {
        const touchesFloor =
          isFloor(g, gx - 1, gy) ||
          isFloor(g, gx + 1, gy) ||
          isFloor(g, gx, gy - 1) ||
          isFloor(g, gx, gy + 1);
        if (touchesFloor) row.push(wallChar(g, gx, gy));
        else row.push(" ");
      }
    }
    chars.push(row);
  }

  const density: AsciiDensity = opts.density ?? 1;
  const mapLineArray = chars.map((row) => row.join(""));
  const denseLines = applyAsciiDensity(mapLineArray, density);
  const mapOnly = denseLines.join("\n");

  const legendLines: string[] = ["── Legend ──"];
  const themeBuckets = new Map<string, DungeonMapRoom[]>();
  ordered.forEach((r) => {
    const tg = roomTheme(r) ?? "_ungrouped";
    const arr = themeBuckets.get(tg) ?? [];
    arr.push(r);
    themeBuckets.set(tg, arr);
  });
  const orderedThemes = [...themeBuckets.keys()].sort((a, b) => a.localeCompare(b));
  for (const tg of orderedThemes) {
    const list = themeBuckets.get(tg)!;
    if (tg !== "_ungrouped" && opts.mode === "dm") {
      legendLines.push(`  — ${tg} —`);
    }
    list.forEach((r) => {
      const i = ordered.indexOf(r);
      const mk = ROOM_MARKERS[i] ?? "?";
      const dmName = String(r.name ?? r.namedRoom ?? "Room").trim();
      const pl = String(r.playerLabel ?? "").trim();
      const label = opts.mode === "player" && pl ? pl : dmName;
      const type = String(r.type ?? "chamber");
      const depth = r.depth ?? r.features?.layoutMeta?.depth;
      const depthS = typeof depth === "number" ? `  d${depth}` : "";
      let extra = "";
      if (opts.mode === "dm") {
        const bits: string[] = [];
        if (r.traps || type === "trap") bits.push("hazard");
        if (Array.isArray(r.monsters) && r.monsters.length > 0) bits.push("encounter");
        if (r.treasures && ((r.treasures.gold ?? 0) > 0 || (r.treasures.items?.length ?? 0) > 0)) bits.push("loot");
        const f = r.features as { secretDoors?: unknown[]; hiddenStashes?: unknown[] } | undefined;
        if (f?.secretDoors?.length) bits.push("secret door");
        if (f?.hiddenStashes?.length) bits.push("hidden stash");
        if (bits.length) extra = `  [${bits.join(", ")}]`;
      }
      legendLines.push(`  ${mk}  ${label}  (${type})${depthS}${extra}`);
    });
  }
  if (opts.mode === "dm") {
    legendLines.push("  +  door   S  secret (DM)   !  trap   ◆  treasure   ✦  stash   ⚔  encounter");
    legendLines.push("  ·  floor   lines  outer walls");
  } else {
    legendLines.push("  +  passage door   ·  floor");
  }

  const legend = legendLines.join("\n");
  const text = `${mapOnly}\n\n${legend}`;

  const width = denseLines[0] ? [...denseLines[0]!].length : 0;
  const height = denseLines.length;

  return { text, mapOnly, legend, width, height };
}

export function downloadAsciiMap(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith(".txt") ? filename : `${filename}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}
