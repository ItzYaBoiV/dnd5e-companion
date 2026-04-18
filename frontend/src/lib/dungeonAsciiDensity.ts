/**
 * Post-process logical ASCII maps to higher visual densities.
 *
 * - density 1: passthrough (caller uses raw lines)
 * - density 2: merge pairs of map rows with Unicode half-blocks (▀▄█) so walls read “taller” at half line count
 * - density 4: supersample each cell to a 4×4 fine grid, pack 2×2 fine pixels per character → ~2W×2H output
 */

const BOX = /[\u2500-\u257F]/;

export type AsciiDensity = 1 | 2 | 4;

function category(ch: string): "void" | "floor" | "wall" | "feature" {
  if (!ch || ch === " ") return "void";
  if (ch === "·" || ch === ".") return "floor";
  if (ch === "+" || ch === "!" || ch === "S" || ch === "◆" || ch === "⚔" || ch === "✦" || ch === "⚑") return "feature";
  if (ch === "#" || BOX.test(ch)) return "wall";
  if (/^[0-9A-Za-z]$/.test(ch)) return "feature";
  return "wall";
}

function halfBlockLine(top: string[], bot: string[]): string {
  let out = "";
  const w = Math.max(top.length, bot.length);
  for (let x = 0; x < w; x++) {
    const a = top[x] ?? " ";
    const b = bot[x] ?? " ";
    const ca = category(a);
    const cb = category(b);
    if (ca === "feature") {
      out += a;
      continue;
    }
    if (cb === "feature") {
      out += b;
      continue;
    }
    const ta = ca === "wall";
    const tb = cb === "wall";
    if (ta && tb) out += "█";
    else if (ta && !tb) out += "▀";
    else if (!ta && tb) out += "▄";
    else out += " ";
  }
  return out;
}

/** Quadrant glyph from four booleans: tl, tr, bl, br = filled (solid) */
function quadChar(tl: boolean, tr: boolean, bl: boolean, br: boolean): string {
  const k = (tl ? 8 : 0) | (tr ? 4 : 0) | (bl ? 2 : 0) | (br ? 1 : 0);
  const M: Record<number, string> = {
    0: " ",
    1: "▖",
    2: "▘",
    3: "▄",
    4: "▝",
    5: "▌",
    6: "▛",
    7: "▟",
    8: "▗",
    9: "▐",
    10: "▜",
    11: "▙",
    12: "▀",
    13: "▞",
    14: "▚",
    15: "█",
  };
  return M[k] ?? "█";
}

/**
 * Expand character grid lines to a fine boolean grid (fineW × fineH).
 * Walls become filled blocks; features a single filled pixel at cell centre.
 */
function rasterizeToFine(lines: string[], scale: number): { fineW: number; fineH: number; solid: boolean[] } {
  const H = lines.length;
  const W = H ? Math.max(...lines.map((r) => r.length)) : 0;
  const fineW = W * scale;
  const fineH = H * scale;
  const solid = new Array<boolean>(fineW * fineH).fill(false);
  const mid = Math.floor(scale / 2);
  for (let y = 0; y < H; y++) {
    const row = lines[y] ?? "";
    for (let x = 0; x < W; x++) {
      const ch = row[x] ?? " ";
      const cat = category(ch);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const fx = x * scale + dx;
          const fy = y * scale + dy;
          let v = false;
          if (cat === "wall") v = true;
          else if (cat === "feature" && dx === mid && dy === mid) v = true;
          solid[fy * fineW + fx] = v;
        }
      }
    }
  }
  return { fineW, fineH, solid };
}

function packQuadrants(fineW: number, fineH: number, solid: boolean[]): string[] {
  const outH = Math.ceil(fineH / 2);
  const outW = Math.ceil(fineW / 2);
  const lines: string[] = [];
  for (let oy = 0; oy < outH; oy++) {
    let row = "";
    for (let ox = 0; ox < outW; ox++) {
      const tl = solid[(oy * 2) * fineW + ox * 2] ?? false;
      const tr = solid[(oy * 2) * fineW + ox * 2 + 1] ?? false;
      const bl = solid[(oy * 2 + 1) * fineW + ox * 2] ?? false;
      const br = solid[(oy * 2 + 1) * fineW + ox * 2 + 1] ?? false;
      row += quadChar(tl, tr, bl, br);
    }
    lines.push(row);
  }
  return lines;
}

/** @param mapLines — physical rows of the ASCII map (no legend) */
export function applyAsciiDensity(mapLines: string[], density: AsciiDensity): string[] {
  if (density === 1 || mapLines.length === 0) return mapLines;
  if (density === 2) {
    const out: string[] = [];
    for (let y = 0; y < mapLines.length; y += 2) {
      const top = [...(mapLines[y] ?? "")];
      const bot = [...(mapLines[y + 1] ?? "")];
      out.push(halfBlockLine(top, bot));
    }
    return out;
  }
  // density 4 → 4× supersample then 2×2 quadrant packing → ~2× linear size
  const { fineW, fineH, solid } = rasterizeToFine(mapLines, 4);
  return packQuadrants(fineW, fineH, solid);
}
