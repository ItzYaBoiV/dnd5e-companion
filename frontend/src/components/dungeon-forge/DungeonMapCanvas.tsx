import { useEffect, useRef } from "react";
import {
  renderDungeonToCanvas,
  type EntityPalette,
  type RenderCell,
  type TilePalette,
} from "@/lib/dungeonTileRenderer";

export type DungeonMapCanvasProps = {
  grid: RenderCell[][];
  cellPx: number;
  palette: TilePalette;
  entities: EntityPalette;
  fogCells?: Set<string> | null;
  showEnts?: boolean;
  playerSanitize?: boolean;
  hideDecoKeys?: Set<string>;
  highlightRoom?: { x: number; y: number; w: number; h: number } | null;
  /** Doors with these grid keys `"x,y"` render open; omitted = all doors drawn open (legacy). */
  doorOpen?: Set<string> | null;
  className?: string;
  style?: React.CSSProperties;
  onCellClick?: (x: number, y: number, cell: RenderCell) => void;
  onCellHover?: (x: number, y: number, cell: RenderCell | null) => void;
};

export function DungeonMapCanvas({
  grid,
  cellPx,
  palette,
  entities,
  fogCells,
  showEnts = true,
  playerSanitize = false,
  hideDecoKeys,
  highlightRoom,
  doorOpen,
  className,
  style,
  onCellClick,
  onCellHover,
}: DungeonMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || grid.length === 0) return;
    renderDungeonToCanvas(canvas, grid, {
      palette,
      entities,
      cellPx,
      dpr,
      fogCells: fogCells ?? null,
      showEnts,
      playerSanitize,
      hideDecoKeys,
      highlightRoom: highlightRoom ?? null,
      doorOpen: doorOpen ?? null,
      inkSaver: false,
    });
  }, [
    grid,
    cellPx,
    palette,
    entities,
    dpr,
    fogCells,
    showEnts,
    playerSanitize,
    hideDecoKeys,
    highlightRoom,
    doorOpen,
  ]);

  function cellFromEvent(e: React.MouseEvent): { x: number; y: number; cell: RenderCell } | null {
    const canvas = canvasRef.current;
    if (!canvas || grid.length === 0) return null;
    const rect = canvas.getBoundingClientRect();
    const cols = grid[0].length;
    const rows = grid.length;
    const ix = e.clientX - rect.left;
    const iy = e.clientY - rect.top;
    const gx = Math.min(cols - 1, Math.max(0, Math.floor((ix / rect.width) * cols)));
    const gy = Math.min(rows - 1, Math.max(0, Math.floor((iy / rect.height) * rows)));
    const cell = grid[gy]?.[gx];
    if (!cell) return null;
    return { x: gx, y: gy, cell };
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ imageRendering: "pixelated", cursor: onCellClick ? "pointer" : "default", ...style }}
      onClick={(e) => {
        const r = cellFromEvent(e);
        if (r) onCellClick?.(r.x, r.y, r.cell);
      }}
      onMouseMove={(e) => {
        const r = cellFromEvent(e);
        onCellHover?.(r?.x ?? -1, r?.y ?? -1, r?.cell ?? null);
      }}
      onMouseLeave={() => onCellHover?.(-1, -1, null)}
    />
  );
}
