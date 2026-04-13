/**
 * Shared dungeon schematic renderer (canvas) + PNG export.
 */

export type DungeonMapRoom = {
  layoutId?: string | null;
  id?: string | null;
  name?: string | null;
  playerLabel?: string | null;
  type?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  exits?: Record<string, string | null> | null;
  traps?: unknown;
  monsters?: unknown;
  treasures?: { gold?: number; items?: unknown[] } | null;
  features?: {
    secretDoors?: unknown[];
    hiddenStashes?: unknown[];
  } | null;
};

export type MapLayout = {
  pad: number;
  cell: number;
  maxGX: number;
  maxGY: number;
  contentW: number;
  contentH: number;
};

export type MapPaintMode = "dm" | "player";

function linkExitPoint(
  cx: number,
  cy: number,
  tx: number,
  ty: number,
  left: number,
  top: number,
  rw: number,
  rh: number,
): { x: number; y: number } {
  const dx = tx - cx;
  const dy = ty - cy;
  const right = left + rw;
  const bottom = top + rh;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const x = dx >= 0 ? right : left;
    const y = Math.min(bottom, Math.max(top, cy));
    return { x, y };
  }
  const y = dy >= 0 ? bottom : top;
  const x = Math.min(right, Math.max(left, cx));
  return { x, y };
}

function strokeManhattan(ctx: CanvasRenderingContext2D, p1: { x: number; y: number }, p2: { x: number; y: number }) {
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  if (Math.abs(p2.x - p1.x) >= Math.abs(p2.y - p1.y)) {
    ctx.lineTo(p2.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
  } else {
    ctx.lineTo(p1.x, p2.y);
    ctx.lineTo(p2.x, p2.y);
  }
  ctx.stroke();
}

function wrapLabelLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let line = words[i++]!;
    while (i < words.length && ctx.measureText(`${line} ${words[i]}`).width <= maxW) {
      line = `${line} ${words[i++]!}`;
    }
    lines.push(line);
  }
  if (i < words.length && lines.length > 0) {
    const merged = `${lines[lines.length - 1]!} ${words.slice(i).join(" ")}`;
    let s = merged;
    while (s.length > 0 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    lines[lines.length - 1] = s.length > 0 ? `${s}…` : "…";
  }
  return lines;
}

const ROOM_COLORS: Record<string, string> = {
  entrance: "rgba(74, 124, 89, 0.42)",
  corridor: "rgba(130, 118, 95, 0.35)",
  chamber: "rgba(107, 76, 122, 0.32)",
  boss: "rgba(139, 47, 47, 0.38)",
  treasure: "rgba(180, 140, 40, 0.34)",
  trap: "rgba(120, 60, 100, 0.3)",
};

const ROOM_BORDERS: Record<string, string> = {
  entrance: "#2f5f3a",
  corridor: "#6b5c48",
  chamber: "#4a3560",
  boss: "#6b1c1c",
  treasure: "#7a5a12",
  trap: "#5a2860",
};

/** Player-facing map: boss / treasure / trap tiles use the same palette as generic chambers. */
function paintType(raw: string | undefined, mode: MapPaintMode): string {
  const t = raw ?? "chamber";
  if (mode === "dm") return t;
  if (t === "entrance") return "entrance";
  if (t === "corridor") return "corridor";
  return "chamber";
}

export function computeMapLayout(
  rooms: DungeonMapRoom[],
  opt:
    | { mode: "fit"; maxViewW: number; maxViewH: number; pad?: number; cellMin?: number; cellMax?: number }
    | { mode: "fixed"; cell: number; pad?: number },
): MapLayout {
  const pad = opt.pad ?? 20;
  const maxGX = Math.max(0, ...rooms.map((r) => r.x + r.width)) + 1;
  const maxGY = Math.max(0, ...rooms.map((r) => r.y + r.height)) + 1;

  if (opt.mode === "fixed") {
    const cell = opt.cell;
    return {
      pad,
      cell,
      maxGX,
      maxGY,
      contentW: maxGX * cell + pad * 2,
      contentH: maxGY * cell + pad * 2,
    };
  }

  const cellMin = opt.cellMin ?? 12;
  const cellMax = opt.cellMax ?? 44;
  let CELL = 26;
  let contentW = maxGX * CELL + pad * 2;
  let contentH = maxGY * CELL + pad * 2;
  const maxW = Math.max(120, opt.maxViewW - 4);
  const maxH = Math.max(200, opt.maxViewH - 4);
  const fit = Math.min(maxW / contentW, maxH / contentH);
  if (fit < 1) CELL = Math.max(cellMin, Math.floor(CELL * fit));
  else if (fit > 1.08) CELL = Math.min(cellMax, Math.floor(CELL * Math.min(fit, 2)));
  contentW = maxGX * CELL + pad * 2;
  contentH = maxGY * CELL + pad * 2;
  return { pad, cell: CELL, maxGX, maxGY, contentW, contentH };
}

export function paintDungeonMap(
  ctx: CanvasRenderingContext2D,
  rooms: DungeonMapRoom[],
  layout: MapLayout,
  opts: { showSecrets: boolean; labelMode: MapPaintMode },
) {
  const { pad, cell: CELL, maxGX, maxGY } = layout;
  const { showSecrets, labelMode } = opts;

  const parchment = ctx.createLinearGradient(0, 0, layout.contentW, layout.contentH);
  parchment.addColorStop(0, "#ede4d3");
  parchment.addColorStop(0.45, "#e0d2bc");
  parchment.addColorStop(1, "#d2c4aa");
  ctx.fillStyle = parchment;
  ctx.fillRect(0, 0, layout.contentW, layout.contentH);

  ctx.strokeStyle = "rgba(101, 84, 63, 0.1)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= maxGX; gx++) {
    ctx.beginPath();
    ctx.moveTo(pad + gx * CELL, pad);
    ctx.lineTo(pad + gx * CELL, pad + maxGY * CELL);
    ctx.stroke();
  }
  for (let gy = 0; gy <= maxGY; gy++) {
    ctx.beginPath();
    ctx.moveTo(pad, pad + gy * CELL);
    ctx.lineTo(pad + maxGX * CELL, pad + gy * CELL);
    ctx.stroke();
  }

  const byLayout = new Map<string, DungeonMapRoom>();
  for (const r of rooms) {
    const lid = typeof r.layoutId === "string" && r.layoutId.trim() ? r.layoutId.trim() : "";
    if (lid) byLayout.set(lid, r);
  }

  const rectOf = (r: DungeonMapRoom) => ({
    left: pad + r.x * CELL,
    top: pad + r.y * CELL,
    w: r.width * CELL,
    h: r.height * CELL,
  });

  const centerOf = (r: DungeonMapRoom) => {
    const { left, top, w, h } = rectOf(r);
    return { x: left + w / 2, y: top + h / 2 };
  };

  const drawn = new Set<string>();
  ctx.strokeStyle = "rgba(88, 62, 42, 0.55)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.lineCap = "round";

  for (const r of rooms) {
    const ex = r.exits;
    if (!ex || typeof ex !== "object") continue;
    const fromId = typeof r.layoutId === "string" ? r.layoutId.trim() : "";
    const cA = centerOf(r);
    const ra = rectOf(r);

    const tryLink = (tid: unknown) => {
      if (typeof tid !== "string" || !tid.trim()) return;
      const target = byLayout.get(tid.trim());
      if (!target) return;
      const k = [fromId, tid.trim()].filter(Boolean).sort().join("::");
      if (!k || drawn.has(k)) return;
      drawn.add(k);
      const cB = centerOf(target);
      const rb = rectOf(target);
      const p1 = linkExitPoint(cA.x, cA.y, cB.x, cB.y, ra.left, ra.top, ra.w, ra.h);
      const p2 = linkExitPoint(cB.x, cB.y, cA.x, cA.y, rb.left, rb.top, rb.w, rb.h);
      strokeManhattan(ctx, p1, p2);
    };

    tryLink(ex.north);
    tryLink(ex.south);
    tryLink(ex.east);
    tryLink(ex.west);
  }
  ctx.setLineDash([]);
  ctx.lineCap = "butt";

  const padLabel = 6;
  const iconReserve = showSecrets ? 18 : 0;

  const roomLabel = (room: DungeonMapRoom) => {
    const dmName = String(room.name ?? "Room");
    if (labelMode === "player") {
      const pl = typeof room.playerLabel === "string" ? room.playerLabel.trim() : "";
      return pl || dmName;
    }
    return dmName;
  };

  rooms.forEach((room) => {
    const x = room.x * CELL + pad;
    const y = room.y * CELL + pad;
    const w = room.width * CELL;
    const h = room.height * CELL;

    const pType = paintType(room.type ?? undefined, labelMode);
    ctx.fillStyle = ROOM_COLORS[pType] ?? "rgba(90, 85, 70, 0.25)";
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = ROOM_BORDERS[pType] ?? "#4a4234";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.strokeStyle = "rgba(40, 32, 24, 0.28)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    ctx.setLineDash([]);

    const name = roomLabel(room);
    const maxTextW = Math.max(24, w - padLabel * 2);
    const maxLines = h < CELL * 1.4 ? 2 : Math.min(4, Math.max(2, Math.floor(h / 14)));
    let fontPx = Math.min(12, Math.max(7, Math.floor(CELL * 0.42)));
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let lines: string[] = [];
    for (let tryPx = fontPx; tryPx >= 7; tryPx--) {
      ctx.font = `600 ${tryPx}px ui-sans-serif, system-ui, sans-serif`;
      lines = wrapLabelLines(ctx, name, maxTextW, maxLines);
      const lh = tryPx + 2;
      const blockH = lines.length * lh;
      const maxHt = h - padLabel * 2 - iconReserve;
      if (blockH <= maxHt || tryPx === 7) {
        fontPx = tryPx;
        break;
      }
    }
    ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
    lines = wrapLabelLines(ctx, name, maxTextW, maxLines);
    const lh = fontPx + 2;
    const blockH = lines.length * lh;
    let startY = y + (h - blockH - iconReserve) / 2 + lh / 2;
    if (startY < y + padLabel + lh / 2) startY = y + padLabel + lh / 2;
    ctx.fillStyle = "#2a2318";
    lines.forEach((line, i) => {
      ctx.fillText(line, x + w / 2, startY + i * lh);
    });

    if (showSecrets) {
      const iy = y + h - 12;
      let ix = x + w - 8;
      if (room.traps) {
        ctx.fillStyle = "#5a2860";
        ctx.font = "12px sans-serif";
        ctx.fillText("!", x + w / 2, iy - 2);
      }
      const feats = room.features;
      const stashN = feats?.hiddenStashes?.length ?? 0;
      const doorN = feats?.secretDoors?.length ?? 0;
      if (stashN > 0) {
        ctx.fillStyle = "#6b5a9e";
        ctx.font = "11px sans-serif";
        ctx.fillText("✦", ix, iy);
        ix -= 14;
      }
      if (doorN > 0) {
        ctx.fillStyle = "#3d5a80";
        ctx.font = "11px sans-serif";
        ctx.fillText("⌂", ix, iy);
        ix -= 14;
      }
      const monsters = room.monsters;
      if (Array.isArray(monsters) && monsters.length > 0) {
        ctx.fillStyle = "#8b2c2c";
        ctx.font = "12px sans-serif";
        ctx.fillText("⚔", ix, iy);
        ix -= 14;
      }
      const tr = room.treasures;
      if (tr && ((tr.gold ?? 0) > 0 || (Array.isArray(tr.items) && tr.items.length > 0))) {
        ctx.fillStyle = "#8a6d1a";
        ctx.font = "12px sans-serif";
        ctx.fillText("◆", ix, iy);
      }
    }
  });
}

/** Fit map to a panel and paint (handles devicePixelRatio). */
export function syncDungeonMapCanvas(
  canvas: HTMLCanvasElement,
  rooms: DungeonMapRoom[],
  containerW: number,
  containerH: number,
  opts: { showSecrets: boolean; labelMode: MapPaintMode },
) {
  if (rooms.length === 0 || containerW < 50) return;
  const layout = computeMapLayout(rooms, {
    mode: "fit",
    maxViewW: containerW,
    maxViewH: containerH,
    pad: 20,
    cellMin: 12,
    cellMax: 44,
  });
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  canvas.width = Math.round(layout.contentW * dpr);
  canvas.height = Math.round(layout.contentH * dpr);
  canvas.style.width = `${layout.contentW}px`;
  canvas.style.height = `${layout.contentH}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintDungeonMap(ctx, rooms, layout, opts);
}

export function downloadDungeonMapPng(
  rooms: DungeonMapRoom[],
  opts: {
    showSecrets: boolean;
    labelMode: MapPaintMode;
    filename: string;
    pixelRatio?: number;
    cellSize?: number;
  },
) {
  const cell = opts.cellSize ?? 30;
  const pad = 26;
  const layout = computeMapLayout(rooms, { mode: "fixed", cell, pad });
  const dpr = opts.pixelRatio ?? 2;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(layout.contentW * dpr);
  canvas.height = Math.round(layout.contentH * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintDungeonMap(ctx, rooms, layout, { showSecrets: opts.showSecrets, labelMode: opts.labelMode });
  canvas.toBlob(
    (blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      const name = opts.filename.endsWith(".png") ? opts.filename : `${opts.filename}.png`;
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    },
    "image/png",
    1,
  );
}
