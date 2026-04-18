export type RenderAsciiToCanvasOpts = {
  fontFamily: string;
  fontSizePx: number;
  lineHeight: number;
  fg: string;
  bg: string;
  /** Device pixel ratio; canvas backing store is scaled for sharp PNG export */
  dpr?: number;
  /** Use tiny bitmap fonts and disable smoothing */
  smallFontMode?: boolean;
};

function measureCharWidth(ctx: CanvasRenderingContext2D, sample = "M"): number {
  return ctx.measureText(sample).width || fontSizeFallback(ctx);
}

function fontSizeFallback(ctx: CanvasRenderingContext2D): number {
  const m = /(\d+(?:\.\d+)?)px/.exec(ctx.font);
  return m ? parseFloat(m[1]!) : 8;
}

/**
 * Renders monospace ASCII lines to an off-screen canvas (sharp at high DPR).
 */
export function renderAsciiToCanvas(lines: string[], opts: RenderAsciiToCanvasOpts): HTMLCanvasElement {
  const winDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 2;
  const autoDpr = opts.fontSizePx >= 24 ? 1 : Math.max(2, winDpr);
  const dpr = Math.max(1, opts.dpr ?? autoDpr);
  const fontSize = opts.smallFontMode ? Math.min(opts.fontSizePx, 7) : opts.fontSizePx;
  const font = `${fontSize}px ${opts.fontFamily}`;

  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("Canvas 2D unavailable");
  measure.font = font;
  const cw = Math.max(4, measureCharWidth(measure, "█"));
  const lh = opts.lineHeight * fontSize;

  const maxCols = Math.max(0, ...lines.map((l) => [...l].length));
  const rows = lines.length;
  const cssW = maxCols * cw + 8;
  const cssH = rows * lh + 8;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = !opts.smallFontMode;
  if ("textRendering" in ctx) (ctx as CanvasRenderingContext2D & { textRendering?: string }).textRendering = "geometricPrecision";
  ctx.fillStyle = opts.bg;
  ctx.fillRect(0, 0, cssW, cssH);
  ctx.fillStyle = opts.fg;
  ctx.font = font;
  ctx.textBaseline = "top";

  let y = 4;
  for (const line of lines) {
    const chars = [...line];
    let x = 4;
    for (const ch of chars) {
      ctx.fillText(ch, x, y);
      x += cw;
    }
    y += lh;
  }

  return canvas;
}

export function downloadAsciiPng(lines: string[], opts: RenderAsciiToCanvasOpts, filename: string): void {
  const canvas = renderAsciiToCanvas(lines, opts);
  const a = document.createElement("a");
  a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
  a.href = canvas.toDataURL("image/png");
  a.click();
}
