/**
 * Canvas pixel-art tile renderer for Dungeon Forge.
 * Tile type constants MUST match `T` in DungeonForgeImpl.jsx:
 * { V:0, F:1, W:2, D:3, C:4, SD:5, SU:6, WA:7, P:8, ROAD:9 }
 */

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
};

export type EntityPalette = {
  monster: string;
  trap: string;
  item: string;
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
  /** Grid keys `"x,y"` for doors that are open. Omitted / empty = all doors closed for drawing. */
  doorOpen?: Set<string> | null;
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
    o[k] = hexToGray(p[k]);
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

  canvas.width = Math.ceil(cssW * dpr);
  canvas.height = Math.ceil(cssH * dpr);
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

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const cell = grid[y][x];
      const px = x * cellPx;
      const py = y * cellPx;

      if (fog && !fog.has(`${x},${y}`)) {
        ctx.fillStyle = palette.void;
        ctx.fillRect(px, py, cellPx, cellPx);
        continue;
      }

      drawBaseTile(ctx, cell, px, py, cellPx, palette, grid, x, y, cols, rows, showEnts, sanitize, hideDeco, opts.doorOpen);

      if (hi && x >= hi.x && x < hi.x + hi.w && y >= hi.y && y < hi.y + hi.h) {
        ctx.fillStyle = "rgba(255,220,50,0.18)";
        ctx.fillRect(px, py, cellPx, cellPx);
      }

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
      );
    }
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
): void {
  const t = cell.tile;

  const hideEntityOverlay = !showEnts && (cell.eType === "monster" || cell.eType === "trap" || cell.eType === "item");
  const hideLabel = sanitize && cell.eType === "label";
  const hideDecoCell =
    sanitize &&
    cell.eType === "deco" &&
    cell.extra &&
    typeof cell.extra === "object" &&
    "decoKey" in cell.extra &&
    hideDeco.has(String((cell.extra as { decoKey?: string }).decoKey));

  if (hideEntityOverlay || hideLabel || hideDecoCell) {
    drawTileByKind(ctx, t, px, py, s, p, true, doorOpen, gx, gy);
    return;
  }

  drawTileByKind(ctx, t, px, py, s, p, false, doorOpen, gx, gy);
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
  gx?: number,
  gy?: number,
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
    const bg = mutedFloor ? p.floorBg : t === T_FLOOR ? p.floorBg : p.corridorBg;
    const detail = mutedFloor ? p.floorDetail : t === T_FLOOR ? p.floorDetail : p.corridorFg;
    ctx.fillStyle = bg;
    ctx.fillRect(px, py, s, s);
    if (s >= 8) {
      ctx.fillStyle = detail;
      ctx.globalAlpha = mutedFloor ? 0.2 : 0.35;
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
    return;
  }

  if (t === T_DOOR) {
    const dk = gx != null && gy != null ? `${gx},${gy}` : null;
    const closed = !!(doorOpen && dk && !doorOpen.has(dk));
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
          ctx.lineTo(px + wx, wy + Math.sin((wx / s) * Math.PI * 2) * amp);
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
): void {
  const hideEntity = !showEnts && (cell.eType === "monster" || cell.eType === "trap" || cell.eType === "item");
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

  if (cell.eType === "monster" || cell.eType === "trap" || cell.eType === "item") {
    const radius = Math.max(2, s * 0.35);
    const cx = px + s / 2;
    const cy = py + s / 2;
    const bg =
      cell.eType === "monster" ? ep.monster : cell.eType === "trap" ? ep.trap : ep.item;
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
