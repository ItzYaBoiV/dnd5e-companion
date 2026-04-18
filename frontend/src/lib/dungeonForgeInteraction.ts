import type { RenderCell } from "@/lib/dungeonTileRenderer";
import { DUNGEON_T as T } from "@/lib/dungeonForgeConstants";

export type MapClickIntent = "reveal" | "inspect" | "door" | "none";

export type ResolveClickOpts = {
  isPlayerView: boolean;
  /** Cell is visible under fog */
  cellVisible: boolean;
};

/**
 * Single place for map click semantics (DM vs player preview).
 */
export function resolveClickIntent(
  cell: RenderCell,
  tile: number,
  opts: ResolveClickOpts,
): MapClickIntent {
  if (!opts.cellVisible) return "none";
  if (tile === T.D) return "door";
  if (opts.isPlayerView && cell.eType === "label") return "reveal";
  return "inspect";
}
