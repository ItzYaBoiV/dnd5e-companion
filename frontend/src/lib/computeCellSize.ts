/**
 * Deterministic grid cell size for Dungeon Forge (no silent 0 → tiny fallback).
 * Used by the interactive map; export tests can import this module directly.
 */
export type ComputeCellSizeOpts = {
  vpW: number;
  vpH: number;
  gridW: number;
  gridH: number;
  hiRes: boolean;
  tinyMode: boolean;
  compactCells: boolean;
  /** Padding subtracted from each viewport axis (one side each), px */
  pad?: number;
};

function modeBounds(opts: ComputeCellSizeOpts): { min: number; max: number } {
  if (opts.tinyMode) return { min: 3, max: 14 };
  if (opts.compactCells) return { min: 6, max: 22 };
  if (opts.hiRes) return { min: 9, max: 56 };
  return { min: 8, max: 36 };
}

export function computeCellSize(opts: ComputeCellSizeOpts): number {
  const pad = opts.pad ?? 12;
  const { min, max } = modeBounds(opts);
  const gw = Math.max(1, opts.gridW);
  const gh = Math.max(1, opts.gridH);

  if (opts.vpW <= 0 || opts.vpH <= 0) {
    return min;
  }

  const availW = Math.max(0, opts.vpW - 2 * pad);
  const availH = Math.max(0, opts.vpH - 2 * pad);
  const raw = Math.floor(Math.min(availW / gw, availH / gh));
  return Math.max(min, Math.min(max, raw));
}
