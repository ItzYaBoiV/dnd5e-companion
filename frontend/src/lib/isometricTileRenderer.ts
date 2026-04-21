/**
 * Lightweight isometric (2:1 diamond) preview renderer for dungeon grids.
 */

import type { EntityPalette, RenderCell, RenderTileOpts, TilePalette } from "@/lib/dungeonTileRenderer";

const T_VOID = 0;
const T_WALL = 2;
const T_DOOR = 3;
const T_CORRIDOR = 4;
const T_WATER = 7;
const T_PILLAR = 8;
const T_LAVA = 11;

export type IsometricRenderOpts = {
  grid: RenderCell[][];
  palette: TilePalette;
  entities: EntityPalette;
  tileW: number;
  tileH: number;
  wallH: number;
  animPhase?: number;
  showEnts?: boolean;
  fogCells?: Set<string> | null;
  lightMap?: Float32Array | null;
  cols: number;
  rows: number;
  /** When set, canvas is viewport-sized and the map is panned/zoomed inside it. */
  viewportCss?: { w: number; h: number } | null;
  cameraZoom?: number;
  cameraPanX?: number;
  cameraPanY?: number;
  /** When `viewportCss` is set, draw RTS-style minimap (default true). */
  showMinimap?: boolean;
  /** Town / road: scales volumetric darkness (match flat map). */
  mapOutdoorTime?: RenderTileOpts["mapOutdoorTime"];
};

export function getIsometricMapSpan(
  cols: number,
  rows: number,
  tileW: number,
  tileH: number,
  wallH: number,
): { spanW: number; spanH: number; originX: number; originY: number } {
  const spanW = (cols + rows) * (tileW / 2) + tileW;
  const spanH = (cols + rows) * (tileH / 2) + wallH + tileH;
  return { spanW, spanH, originX: spanW / 2, originY: 0 };
}

/** Inverse of `isoCellToScreen`: map-space (world) pixel coords → grid cell. */
export function isoWorldToGrid(
  worldX: number,
  worldY: number,
  cols: number,
  rows: number,
  tileW: number,
  tileH: number,
  wallH: number,
): { gx: number; gy: number } {
  const { originX } = getIsometricMapSpan(cols, rows, tileW, tileH, wallH);
  const a = (worldX - originX) / (tileW / 2);
  const b = (worldY - wallH) / (tileH / 2);
  const gx = Math.round((a + b) / 2);
  const gy = Math.round((b - a) / 2);
  return { gx, gy };
}

/** Centered pan so world center `(spanW/2, spanH/2)` appears at `(vw/2, vh/2)` at given zoom. */
export function defaultIsoCameraPan(
  vw: number,
  vh: number,
  spanW: number,
  spanH: number,
  zoom: number,
): { panX: number; panY: number } {
  return {
    panX: vw / 2 - (spanW / 2) * zoom,
    panY: vh / 2 - (spanH / 2) * zoom,
  };
}

function isoCellToScreen(
  gx: number,
  gy: number,
  tileW: number,
  tileH: number,
  wallH: number,
  originX: number,
  originY: number,
): { sx: number; sy: number } {
  const sx = (gx - gy) * (tileW / 2) + originX;
  const sy = (gx + gy) * (tileH / 2) + wallH + originY;
  return { sx, sy };
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tw: number,
  th: number,
  fill: string,
  stroke?: string,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - th / 2);
  ctx.lineTo(cx + tw / 2, cy);
  ctx.lineTo(cx, cy + th / 2);
  ctx.lineTo(cx - tw / 2, cy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function baseColorForTile(cell: RenderCell, p: TilePalette): string {
  const t = cell.tile;
  if (t === T_VOID) return p.void;
  if (t === T_WALL || t === T_PILLAR) return p.wallBg;
  if (t === T_DOOR) return p.doorBg;
  if (t === T_WATER) return p.waterBg;
  if (t === T_LAVA) return p.lavaBg ?? p.waterBg;
  if (t === T_CORRIDOR) return p.corridorBg;
  return p.floorBg;
}

function drawMinimapOverlay(
  ctx: CanvasRenderingContext2D,
  grid: RenderCell[][],
  cols: number,
  rows: number,
  p: TilePalette,
  vw: number,
  vh: number,
  panX: number,
  panY: number,
  zoom: number,
  tileW: number,
  tileH: number,
  wallH: number,
): void {
  const MW = 120;
  const MH = 80;
  const pad = 8;
  const mx0 = vw - MW - pad;
  const my0 = pad;
  ctx.fillStyle = "rgba(8,6,12,0.72)";
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.fillRect(mx0, my0, MW, MH);
  ctx.strokeRect(mx0 + 0.5, my0 + 0.5, MW - 1, MH - 1);

  const cs = Math.min(MW / cols, MH / rows);
  const mapW = cols * cs;
  const mapH = rows * cs;
  const ox = mx0 + (MW - mapW) / 2;
  const oy = my0 + (MH - mapH) / 2;

  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cell = grid[gy]![gx]!;
      const t = cell.tile;
      if (t === T_VOID) continue;
      ctx.fillStyle = baseColorForTile(cell, p);
      ctx.fillRect(ox + gx * cs, oy + gy * cs, Math.max(1, cs - 0.25), Math.max(1, cs - 0.25));
    }
  }

  const corners: Array<{ sx: number; sy: number }> = [
    { sx: 0, sy: 0 },
    { sx: vw, sy: 0 },
    { sx: 0, sy: vh },
    { sx: vw, sy: vh },
  ];
  let minGx = cols;
  let minGy = rows;
  let maxGx = 0;
  let maxGy = 0;
  for (const c of corners) {
    const wx = (c.sx - panX) / zoom;
    const wy = (c.sy - panY) / zoom;
    const g = isoWorldToGrid(wx, wy, cols, rows, tileW, tileH, wallH);
    minGx = Math.min(minGx, g.gx);
    minGy = Math.min(minGy, g.gy);
    maxGx = Math.max(maxGx, g.gx);
    maxGy = Math.max(maxGy, g.gy);
  }
  minGx = Math.max(0, minGx - 1);
  minGy = Math.max(0, minGy - 1);
  maxGx = Math.min(cols - 1, maxGx + 1);
  maxGy = Math.min(rows - 1, maxGy + 1);

  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(
    ox + minGx * cs + 0.5,
    oy + minGy * cs + 0.5,
    (maxGx - minGx + 1) * cs - 1,
    (maxGy - minGy + 1) * cs - 1,
  );
}

/** Renders an isometric preview of `grid` onto `canvas` (resizes canvas to fit). */
export function renderIsometricToCanvas(canvas: HTMLCanvasElement, opts: IsometricRenderOpts): void {
  const {
    grid,
    palette: p,
    entities: ep,
    tileW: twIn,
    tileH: thIn,
    wallH: whIn,
    animPhase = 0,
    showEnts = true,
    fogCells,
    lightMap,
    cols,
    rows,
    viewportCss,
    cameraZoom = 1,
    cameraPanX = 0,
    cameraPanY = 0,
    showMinimap = true,
    mapOutdoorTime,
  } = opts;
  const outdoorDarkMul =
    mapOutdoorTime === "day"
      ? 0.22
      : mapOutdoorTime === "dusk"
        ? 0.46
        : mapOutdoorTime === "night"
          ? 0.78
          : 1;
  const tileW = twIn || 64;
  const tileH = thIn || 32;
  const wallH = whIn || 30;
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const { spanW, spanH, originX, originY } = getIsometricMapSpan(cols, rows, tileW, tileH, wallH);

  const useViewport = Boolean(viewportCss && viewportCss.w > 0 && viewportCss.h > 0);
  const cssW = useViewport ? viewportCss!.w : spanW;
  const cssH = useViewport ? viewportCss!.h : spanH;

  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.ceil(cssW * dpr);
  canvas.height = Math.ceil(cssH * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = p.void;
  ctx.fillRect(0, 0, cssW, cssH);

  const order: { gx: number; gy: number }[] = [];
  for (let s = 0; s <= cols + rows - 2; s++) {
    for (let gx = 0; gx < cols; gx++) {
      const gy = s - gx;
      if (gy < 0 || gy >= rows) continue;
      order.push({ gx, gy });
    }
  }

  const drawWorld = (): void => {
    for (const { gx, gy } of order) {
      const cell = grid[gy]![gx]!;
      if (fogCells && !fogCells.has(`${gx},${gy}`)) continue;
      const { sx, sy } = isoCellToScreen(gx, gy, tileW, tileH, wallH, originX, originY);
      const t = cell.tile;
      if (t === T_VOID) continue;

      const base = baseColorForTile(cell, p);
      const isWall = t === T_WALL || t === T_PILLAR;
      drawDiamond(ctx, sx, sy, tileW, tileH, base, "rgba(0,0,0,0.35)");

      if (isWall) {
        const left = base;
        const right = p.wallShadow;
        ctx.fillStyle = left;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(sx - tileW / 2, sy);
        ctx.lineTo(sx, sy + tileH / 2);
        ctx.lineTo(sx, sy + tileH / 2 + wallH * 0.45);
        ctx.lineTo(sx - tileW / 2, sy + wallH * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = right;
        ctx.beginPath();
        ctx.moveTo(sx + tileW / 2, sy);
        ctx.lineTo(sx, sy + tileH / 2);
        ctx.lineTo(sx, sy + tileH / 2 + wallH * 0.45);
        ctx.lineTo(sx + tileW / 2, sy + wallH * 0.25);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      if (lightMap) {
        let dark = (lightMap[gy * cols + gx] ?? 0) * 0.9;
        if (mapOutdoorTime && outdoorDarkMul < 1) dark *= outdoorDarkMul;
        if (dark > 0.02) {
          ctx.fillStyle = `rgba(0,0,0,${Math.min(0.4, dark * 0.82)})`;
          ctx.beginPath();
          ctx.moveTo(sx, sy - tileH / 2);
          ctx.lineTo(sx + tileW / 2, sy);
          ctx.lineTo(sx, sy + tileH / 2);
          ctx.lineTo(sx - tileW / 2, sy);
          ctx.closePath();
          ctx.fill();
        }
      }

      if (showEnts && (cell.eType === "monster" || cell.eType === "trap" || cell.eType === "item")) {
        const fill =
          cell.eType === "monster" ? ep.monster : cell.eType === "trap" ? ep.trap : ep.item;
        ctx.fillStyle = fill;
        ctx.font = `${Math.max(8, tileW * 0.28)}px monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          cell.ch.length > 1 ? cell.ch[0] : cell.ch,
          sx,
          sy + Math.sin(animPhase * Math.PI * 2 + gx) * 2,
        );
      }
    }
  };

  if (useViewport) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cssW, cssH);
    ctx.clip();
    ctx.translate(cameraPanX, cameraPanY);
    ctx.scale(cameraZoom, cameraZoom);
    drawWorld();
    ctx.restore();
    if (showMinimap) {
      drawMinimapOverlay(
        ctx,
        grid,
        cols,
        rows,
        p,
        cssW,
        cssH,
        cameraPanX,
        cameraPanY,
        cameraZoom,
        tileW,
        tileH,
        wallH,
      );
    }
  } else {
    drawWorld();
  }
}
