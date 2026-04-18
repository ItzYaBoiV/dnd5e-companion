/**
 * Logical pixels per tile for the Dungeon Forge canvas map.
 * Returns the user’s `cellPx` preference, optionally clamped so the full grid
 * fits in the viewport (padding subtracted). No ASCII/density modes — the
 * canvas renderer scales cleanly.
 */
export type ComputeCellSizeOpts = {
  vpW: number;
  vpH: number;
  gridW: number;
  gridH: number;
  /** User preference (px per cell); may be reduced to fit the viewport. */
  cellPx: number;
  /** Padding subtracted from each viewport axis (one side each), px */
  pad?: number;
};

export function computeCellSize(opts: ComputeCellSizeOpts): number {
  const pad = opts.pad ?? 12;
  const gw = Math.max(1, opts.gridW);
  const gh = Math.max(1, opts.gridH);
  const want = Math.max(4, opts.cellPx);

  if (opts.vpW <= 0 || opts.vpH <= 0) {
    return want;
  }

  const availW = Math.max(0, opts.vpW - 2 * pad);
  const availH = Math.max(0, opts.vpH - 2 * pad);
  const autoFit = Math.floor(Math.min(availW / gw, availH / gh));
  if (autoFit <= 0) return want;
  return Math.max(4, Math.min(want, autoFit));
}
