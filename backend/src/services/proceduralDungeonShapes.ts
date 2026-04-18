/**
 * Room footprint masks for procedural layouts (grid cells relative to top-left of bounding box).
 * Used for overlap checks when layouts opt into non-rectangular footprints; tests lock geometry invariants.
 */

export type RoomShape = "rect" | "L" | "T" | "plus" | "oval" | "cavern";

/** Midpoint ellipse raster inside [0,w) x [0,h). */
export function rasterEllipse(w: number, h: number): boolean[][] {
  const g: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  if (w < 1 || h < 1) return g;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const rx = Math.max(0.5, w / 2 - 0.25);
  const ry = Math.max(0.5, h / 2 - 0.25);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1.0001) g[y]![x] = true;
    }
  }
  return g;
}

function neighbors8(g: boolean[][], y: number, x: number): number {
  let n = 0;
  const H = g.length;
  const W = g[0]?.length ?? 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const ny = y + dy;
      const nx = x + dx;
      if (ny >= 0 && ny < H && nx >= 0 && nx < W && g[ny]![nx]) n++;
    }
  }
  return n;
}

/** 4 iterations of B678/S345678 on a seeded noise grid (~45% alive), then largest 4-connected component. */
export function cavernMask(w: number, h: number, rnd: () => number): boolean[][] {
  let g: boolean[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => rnd() < 0.45),
  );
  const step = () => {
    const next: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const alive = g[y]![x]!;
        const n = neighbors8(g, y, x);
        let on = alive;
        if (alive) on = n >= 6 || n === 8;
        else on = n >= 3;
        next[y]![x] = on;
      }
    }
    g = next;
  };
  for (let i = 0; i < 4; i++) step();

  const H = h;
  const W = w;
  const seen = Array.from({ length: H }, () => Array(W).fill(false));
  let best: { cells: [number, number][]; size: number } = { cells: [], size: 0 };

  for (let sy = 0; sy < H; sy++) {
    for (let sx = 0; sx < W; sx++) {
      if (!g[sy]![sx] || seen[sy]![sx]) continue;
      const stack: [number, number][] = [[sx, sy]];
      const cells: [number, number][] = [];
      seen[sy]![sx] = true;
      while (stack.length) {
        const [x, y] = stack.pop()!;
        cells.push([x, y]);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (!g[ny]![nx] || seen[ny]![nx]) continue;
          seen[ny]![nx] = true;
          stack.push([nx, ny]);
        }
      }
      if (cells.length > best.size) best = { cells, size: cells.length };
    }
  }

  const out: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  for (const [x, y] of best.cells) out[y]![x] = true;
  return out;
}

/**
 * Boolean occupancy for a room shape inside its bounding box (w × h).
 */
export function shapeMask(shape: RoomShape, w: number, h: number, rnd: () => number): boolean[][] {
  if (w < 1 || h < 1) return [];
  const empty = () => Array.from({ length: h }, () => Array(w).fill(false));
  if (shape === "rect") {
    return Array.from({ length: h }, () => Array(w).fill(true));
  }
  if (shape === "oval") {
    return rasterEllipse(w, h);
  }
  if (shape === "cavern") {
    return cavernMask(w, h, rnd);
  }
  if (shape === "L") {
    const g = empty();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y]![x] = x < Math.ceil(w * 0.55) || y >= Math.floor(h * 0.45);
    return g;
  }
  if (shape === "T") {
    const g = empty();
    const mid = Math.floor(w / 2);
    const barY = Math.floor(h * 0.35);
    for (let x = 0; x < w; x++) g[barY]![x] = true;
    for (let y = barY; y < h; y++) g[y]![mid] = true;
    return g;
  }
  if (shape === "plus") {
    const g = empty();
    const mx = Math.floor(w / 2);
    const my = Math.floor(h / 2);
    for (let x = 0; x < w; x++) g[my]![x] = true;
    for (let y = 0; y < h; y++) g[y]![mx] = true;
    return g;
  }
  return Array.from({ length: h }, () => Array(w).fill(true));
}

export function pickShapeForBucket(
  bucket: "castle" | "dungeon" | "cave" | "sewer",
  rnd: () => number,
): RoomShape {
  const r = rnd();
  if (bucket === "castle") {
    if (r < 0.8) return "rect";
    if (r < 0.95) return "L";
    return "plus";
  }
  if (bucket === "cave") {
    if (r < 0.7) return "cavern";
    if (r < 0.9) return "oval";
    return "rect";
  }
  if (bucket === "sewer") {
    if (r < 0.4) return "rect";
    if (r < 0.7) return "L";
    if (r < 0.9) return "T";
    return "cavern";
  }
  // dungeon default
  if (r < 0.5) return "rect";
  if (r < 0.7) return "L";
  if (r < 0.85) return "T";
  if (r < 0.95) return "plus";
  return rnd() < 0.5 ? "oval" : "rect";
}

export function masksOverlap(
  ax: number,
  ay: number,
  ma: boolean[][],
  bx: number,
  by: number,
  mb: boolean[][],
): boolean {
  const ha = ma.length;
  const wa = ma[0]?.length ?? 0;
  const hb = mb.length;
  const wb = mb[0]?.length ?? 0;
  const x0 = Math.max(ax, bx);
  const y0 = Math.max(ay, by);
  const x1 = Math.min(ax + wa, bx + wb);
  const y1 = Math.min(ay + ha, by + hb);
  if (x1 <= x0 || y1 <= y0) return false;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (ma[y - ay]![x - ax] && mb[y - by]![x - bx]) return true;
    }
  }
  return false;
}
